import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, Database, Play, Pause, Square, Trash2, Plus, X,
  Upload, Clock, FileText, RotateCcw, Wifi, WifiOff, Terminal,
  ChevronRight, Activity, ToggleLeft, ToggleRight, BarChart2,
  Globe, HardDrive, Radio,
} from 'lucide-react';
import StatusBadge from '../components/ui/StatusBadge';
import Loader from '../components/ui/Loader';
import Portal from '../components/ui/Portal';
import { usePolling } from '../hooks/useApi';
import { useSimulatorLogs } from '../hooks/useSimulatorLogs';
import * as api from '../services/api';
import type { Simulator, SimulatorMetrics } from '../types';
import { palette } from '../lib/theme';

/* ── Constants ────────────────────────────────────────────────── */

const TYPE_META: Record<string, { icon: React.ElementType; label: string; gradient: string; iconColor: string }> = {
  vm:            { icon: Server,    label: 'EC2 / VM',       gradient: 'from-[rgba(58,90,125,0.10)] to-transparent',   iconColor: palette.info },
  db:            { icon: Database,  label: 'Database',       gradient: 'from-[rgba(102,71,116,0.10)] to-transparent',  iconColor: palette.plum },
  cache:         { icon: HardDrive, label: 'Cache (Redis)',  gradient: 'from-[rgba(197,82,77,0.10)] to-transparent',   iconColor: palette.critical },
  load_balancer: { icon: Globe,     label: 'Load Balancer',  gradient: 'from-[rgba(192,138,62,0.10)] to-transparent',  iconColor: palette.warning },
  queue:         { icon: Radio,     label: 'Message Queue',  gradient: 'from-[rgba(61,125,101,0.10)] to-transparent',  iconColor: palette.success },
  metrics:       { icon: BarChart2, label: 'Fleet Metrics',  gradient: 'from-[rgba(53,53,140,0.08)] to-transparent',    iconColor: palette.accent },
};

const METRIC_DEFS: { key: keyof SimulatorMetrics; label: string; unit: string; max: number; color: string }[] = [
  { key: 'cpu_percent',      label: 'CPU',      unit: '%',     max: 100,  color: palette.accent }, // accent
  { key: 'memory_percent',   label: 'Memory',   unit: '%',     max: 100,  color: palette.accentBright }, // accent-bright
  { key: 'disk_percent',     label: 'Disk',     unit: '%',     max: 100,  color: palette.info }, // info
  { key: 'network_in_mbps',  label: 'Net In',   unit: 'Mbps',  max: 1000, color: palette.success }, // success
  { key: 'network_out_mbps', label: 'Net Out',  unit: 'Mbps',  max: 1000, color: palette.plum }, // plum
  { key: 'request_rate',     label: 'Req/s',    unit: 'req/s', max: 5000, color: palette.warning }, // warning
  { key: 'error_rate',       label: 'Errors',   unit: '%',     max: 100,  color: palette.critical }, // critical
  { key: 'latency_ms',       label: 'Latency',  unit: 'ms',    max: 2000, color: palette.ink }, // ink
];

const DEFAULT_METRICS: SimulatorMetrics = {
  cpu_percent: 45,
  memory_percent: 60,
  disk_percent: 35,
  network_in_mbps: 50,
  network_out_mbps: 30,
  request_rate: 200,
  error_rate: 1,
  latency_ms: 80,
};

/* ── MiniMetricBar ────────────────────────────────────────────── */
function MiniMetricBar({ label, value, max, unit, color }: { label: string; value: number; max: number; unit: string; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px] text-ink-faint">
        <span>{label}</span>
        <span className="font-medium text-ink-soft">{value}{unit}</span>
      </div>
      <div className="h-1 bg-black/8 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>
    </div>
  );
}

/* ── MetricsConfigPanel ───────────────────────────────────────── */
function MetricsConfigPanel({
  config,
  onChange,
}: {
  config: SimulatorMetrics;
  onChange: (k: keyof SimulatorMetrics, v: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      {METRIC_DEFS.map(({ key, label, unit, max }) => (
        <div key={key}>
          <label className="block text-[10px] font-medium text-ink-mute mb-1">
            {label} ({unit})
          </label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={max}
              step={max > 100 ? 10 : 1}
              value={config[key] ?? 0}
              onChange={(e) => onChange(key, Number(e.target.value))}
              className="flex-1 accent-accent h-1.5"
            />
            <span className="text-xs text-ink-soft w-12 text-right tabular-nums">
              {config[key] ?? 0}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── CreateModal ──────────────────────────────────────────────── */
function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName]         = useState('');
  const [type, setType]         = useState('vm');
  const [interval, setInterval] = useState('5');
  const [file, setFile]         = useState<File | null>(null);
  const [metricsOn, setMetricsOn] = useState(false);
  const [metricsConfig, setMetricsConfig] = useState<SimulatorMetrics>({ ...DEFAULT_METRICS });
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleMetricChange = (k: keyof SimulatorMetrics, v: number) =>
    setMetricsConfig((prev) => ({ ...prev, [k]: v }));

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('simulator_type', type);
      fd.append('interval_seconds', interval);
      if (file) fd.append('log_file', file);
      const created = await api.createSimulator(fd);
      // Save metrics config if enabled
      if (metricsOn) {
        await api.updateSimulatorMetrics(created.id, true, metricsConfig as Record<string, number>);
      }
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create simulator');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Portal>
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="sheet-backdrop flex items-center justify-center px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-modal w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">New Simulator</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-black/8 rounded-lg transition-colors">
            <X size={18} className="text-ink-faint" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-ink-mute mb-1.5">Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. web-server-01"
              className="w-full bg-[var(--color-surface-strong)] border border-hairline-strong rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/10"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-ink-mute mb-1.5">Instance Type *</label>
            <div className="grid grid-cols-2 gap-2">
              {(['vm', 'db', 'cache', 'load_balancer', 'queue'] as const).map((t) => {
                const meta = TYPE_META[t];
                const Icon = meta.icon;
                return (
                  <button key={t} onClick={() => setType(t)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      type === t
                        ? 'bg-accent/10 text-accent ring-1 ring-accent/40'
                        : 'bg-canvas-soft text-ink-soft hover:bg-canvas'
                    }`}
                  >
                    <Icon size={15} />{meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interval */}
          <div>
            <label className="block text-xs font-medium text-ink-mute mb-1.5">Log Playback Interval (seconds)</label>
            <div className="relative">
              <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input type="number" min="1" max="60" value={interval} onChange={(e) => setInterval(e.target.value)}
                className="w-full bg-[var(--color-surface-strong)] border border-hairline-strong rounded-lg pl-8 pr-3 py-2 text-sm text-ink focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/10"
              />
            </div>
            <p className="text-xs text-ink-faint mt-1">One log line emitted every {interval || '5'}s</p>
          </div>

          {/* File upload */}
          <div>
            <label className="block text-xs font-medium text-ink-mute mb-1.5">Log File (.log / .txt)</label>
            <input ref={fileRef} type="file" accept=".log,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
            <button onClick={() => fileRef.current?.click()}
              className={`w-full flex flex-col items-center justify-center gap-2 px-4 py-5 border-2 border-dashed rounded-lg text-sm transition-colors ${
                file ? 'border-accent/40 bg-accent/5 text-accent' : 'border-hairline-strong text-ink-faint hover:border-accent/40 hover:text-accent'
              }`}
            >
              {file ? (
                <><FileText size={18} /><span className="font-medium">{file.name}</span><span className="text-xs opacity-70">{(file.size / 1024).toFixed(1)} KB — click to change</span></>
              ) : (
                <><Upload size={18} /><span>Click to upload log file</span></>
              )}
            </button>
          </div>

          {/* ── Performance Metrics toggle ── */}
          <div className="bg-canvas-soft rounded-xl overflow-hidden">
            <button
              onClick={() => setMetricsOn((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-canvas transition-colors"
            >
              <div className="flex items-center gap-2">
                <Activity size={15} className="text-accent" />
                <span className="text-sm font-medium text-ink-soft">Performance Metrics</span>
                <span className="text-xs text-ink-faint">optional</span>
              </div>
              {metricsOn
                ? <ToggleRight size={22} className="text-accent" />
                : <ToggleLeft size={22} className="text-ink-faint" />}
            </button>

            <AnimatePresence>
              {metricsOn && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-2 border-t border-hairline-strong/70 space-y-3">
                    <p className="text-xs text-ink-faint">
                      Set simulated metric values. Small variance (±5%) applied automatically while running.
                    </p>
                    <MetricsConfigPanel config={metricsConfig} onChange={handleMetricChange} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {error && <p className="text-xs text-critical bg-critical/10 border border-critical/20 px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-black/5 text-ink-soft rounded-lg text-sm font-medium hover:bg-black/10 transition-colors">
            Cancel
          </button>
          <button onClick={handleCreate} disabled={!name.trim() || creating}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-bright transition-colors disabled:opacity-40"
          >
            {creating
              ? <><motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full" />Creating…</>
              : <><Plus size={14} />Create Simulator</>
            }
          </button>
        </div>
      </motion.div>
    </motion.div>
    </Portal>
  );
}

/* ── MetricsEditModal ─────────────────────────────────────────── */
function MetricsEditModal({ simulator, onClose, onSaved }: { simulator: Simulator; onClose: () => void; onSaved: () => void }) {
  const [enabled, setEnabled] = useState(simulator.metrics_enabled);
  const [config, setConfig]   = useState<SimulatorMetrics>({
    ...DEFAULT_METRICS,
    ...simulator.metrics_config,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateSimulatorMetrics(simulator.id, enabled, config as Record<string, number>);
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Portal>
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="sheet-backdrop flex items-center justify-center px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-modal w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-accent" />
            <h2 className="text-lg font-bold text-ink">Metrics — {simulator.name}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-black/8 rounded-lg transition-colors"><X size={18} className="text-ink-faint" /></button>
        </div>

        {/* Toggle */}
        <button onClick={() => setEnabled((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-canvas-soft rounded-xl hover:bg-canvas transition-colors"
        >
          <span className="text-sm font-medium text-ink-soft">Enable metrics simulation</span>
          {enabled ? <ToggleRight size={22} className="text-accent" /> : <ToggleLeft size={22} className="text-ink-faint" />}
        </button>

        <AnimatePresence>
          {enabled && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <MetricsConfigPanel config={config} onChange={(k, v) => setConfig((p) => ({ ...p, [k]: v }))} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-black/5 text-ink-soft rounded-lg text-sm font-medium hover:bg-black/10 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-bright transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </motion.div>
    </motion.div>
    </Portal>
  );
}

/* ── LogViewerModal ───────────────────────────────────────────── */
const LEVEL_COLORS: Record<string, string> = {
  CRITICAL: 'text-[var(--color-term-critical)]',
  ERROR:    'text-[var(--color-term-critical)]',
  WARN:     'text-[var(--color-term-warn)]',
  WARNING:  'text-[var(--color-term-warn)]',
  INFO:     'text-[var(--color-term-info)]',
  DEBUG:    'text-[var(--color-term-debug)]',
};

function LogViewerModal({ simulator, onClose }: { simulator: Simulator; onClose: () => void }) {
  const { logs, wsStatus, currentLine, totalLines, liveMetrics, connected, clearLogs, reconnect, isMetricsStream } =
    useSimulatorLogs(simulator.id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Only auto-scroll while user is pinned near the bottom — gives them
  // room to scroll up and inspect history without it jumping back.
  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [logs, autoScroll]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAutoScroll(nearBottom);
  };

  const isMetrics = simulator.simulator_type === 'metrics' || isMetricsStream;
  const progress = totalLines > 0 ? (currentLine / totalLines) * 100 : 0;
  const hasMetricsPanel = !isMetrics && simulator.metrics_enabled && liveMetrics;

  return (
    <Portal>
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="sheet-backdrop flex items-center justify-center px-3 sm:px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-modal w-full max-w-5xl flex flex-col overflow-hidden h-[88vh] sm:h-[76vh]"
      >
        {/* Header */}
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 border-b border-hairline-strong/60 shrink-0 flex-wrap">
          <Terminal size={15} className="text-ink-faint shrink-0" />
          <span className="font-semibold text-ink text-sm truncate">{simulator.name}</span>
          <StatusBadge status={wsStatus} pulse={wsStatus === 'running'} />
          <span className={`hidden sm:flex items-center gap-1 text-xs ${connected ? 'text-success' : 'text-ink-faint'}`}>
            {connected ? <Wifi size={11} /> : <WifiOff size={11} />}
            {connected ? 'Live' : 'Disconnected'}
          </span>
          {!connected && <button onClick={reconnect} className="text-xs text-accent hover:underline">Reconnect</button>}
          <div className="ml-auto flex items-center gap-2">
            {isMetrics ? (
              <span className="hidden sm:inline text-xs text-ink-faint tabular-nums">
                {logs.length} {logs.length === 1 ? 'line' : 'lines'} streamed
              </span>
            ) : (
              <span className="hidden sm:inline text-xs text-ink-faint tabular-nums">{currentLine} / {totalLines} lines</span>
            )}
            <button onClick={clearLogs} className="px-2.5 py-1 bg-black/5 hover:bg-black/10 text-ink-mute text-xs rounded-lg transition-colors">Clear</button>
            <button onClick={onClose} className="p-1.5 hover:bg-black/8 rounded-lg transition-colors"><X size={15} className="text-ink-faint" /></button>
          </div>
        </div>

        {/* Progress bar — only meaningful for log-file playback */}
        {!isMetrics && (
          <div className="h-0.5 bg-ink/8 shrink-0">
            <motion.div className="h-full bg-accent" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Log terminal */}
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-auto terminal-pane font-mono text-xs p-4">
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-ink-soft gap-2">
                <Terminal size={28} className="opacity-40" />
                <p>
                  {isMetrics
                    ? 'Waiting for the next simulated tick…'
                    : 'No logs yet. Start the simulator to begin streaming.'}
                </p>
              </div>
            ) : (
              logs.map((entry, i) => {
                const colorClass = entry.level
                  ? LEVEL_COLORS[entry.level.toUpperCase()] ?? 'text-[var(--color-term-info)]'
                  : 'text-[var(--color-term-info)]';
                return (
                  <div key={i} className="flex gap-3 py-0.5 hover:bg-white/5 px-1 rounded leading-5">
                    <span className="text-ink-soft select-none w-10 text-right shrink-0 tabular-nums">{i + 1}</span>
                    <span className={`${colorClass} break-all whitespace-pre-wrap`}>{entry.line}</span>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Live metrics panel — log-file simulators only */}
          {hasMetricsPanel && liveMetrics && (
            <div className="hidden md:flex md:flex-col w-56 shrink-0 border-l border-white/5 bg-[var(--color-term-bg-soft)] p-4 gap-3 overflow-auto">
              <div className="flex items-center gap-1.5 mb-2">
                <Activity size={12} className="text-accent" />
                <span className="text-xs font-semibold text-ink-faint">Live Metrics</span>
              </div>
              {METRIC_DEFS.filter((d) => liveMetrics[d.key] != null).map(({ key, label, unit, max, color }) => (
                <MiniMetricBar
                  key={key}
                  label={label}
                  value={liveMetrics[key] ?? 0}
                  max={max}
                  unit={unit}
                  color={color}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
    </Portal>
  );
}

/* ── SimulatorCard ────────────────────────────────────────────── */
function SimulatorCard({
  sim,
  onAction,
  onDelete,
  onViewLogs,
  onEditMetrics,
}: {
  sim: Simulator;
  onAction: (id: number, action: string) => void;
  onDelete: (id: number) => void;
  onViewLogs: (sim: Simulator) => void;
  onEditMetrics: (sim: Simulator) => void;
}) {
  const meta = TYPE_META[sim.simulator_type] ?? TYPE_META.vm;
  const Icon = meta.icon;
  const isMetrics = sim.simulator_type === 'metrics';
  const progress = sim.total_lines > 0 ? (sim.current_line_index / sim.total_lines) * 100 : 0;
  const cfg = sim.metrics_config ?? {};

  return (
    <motion.div layout className={`glass p-5 space-y-3 bg-gradient-to-b ${meta.gradient}`}>
      {/* Row 1 — title side gets the whole row; only the status badge
          shares it, kept narrow so the name has room at any width. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${meta.iconColor}18` }}>
            <Icon size={20} style={{ color: meta.iconColor }} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink truncate" title={sim.name}>
              {sim.name}
            </h3>
            <p className="text-xs text-ink-faint truncate">{meta.label}</p>
          </div>
        </div>
        <StatusBadge status={sim.status} pulse={sim.status === 'running'} />
      </div>

      {/* Row 2 — View Logs lives on its own line, same pattern as the
          Infrastructure node card. Keeps the Terminal icon + text and
          never competes with the title for horizontal space. */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => onViewLogs(sim)}
          title="Open live log terminal"
          className="group relative inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--color-term-bg-soft)] text-[var(--color-term-info)] hover:bg-[var(--color-term-bg)] hover:text-[var(--color-term-mint)] ring-1 ring-white/10 hover:ring-[var(--color-term-info)]/40 text-[10px] font-mono font-medium transition-colors shrink-0"
        >
          <Terminal size={11} />
          <span>View Logs</span>
          {sim.status === 'running' && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
          )}
        </button>
      </div>

      {/* Log progress — only for vm/db types */}
      {!isMetrics && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-ink-faint">
            <span>Log Progress</span>
            <span className="tabular-nums">{sim.current_line_index} / {sim.total_lines} lines</span>
          </div>
          <div className="h-1.5 bg-black/8 rounded-full overflow-hidden">
            <motion.div className="h-full bg-accent rounded-full" animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
          </div>
        </div>
      )}

      {/* Metrics mini-bars */}
      {(isMetrics || (sim.metrics_enabled && Object.keys(cfg).length > 0)) && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1 border-t border-hairline-strong/50">
          {isMetrics ? (
            /* Fleet metrics: show live indicator */
            <div className="col-span-2 flex items-center gap-2 text-xs">
              <span className={`flex items-center gap-1 ${sim.status === 'running' ? 'text-accent' : 'text-ink-faint'}`}>
                <Activity size={11} />
                {sim.status === 'running' ? 'Streaming infrastructure metrics' : 'Metrics paused'}
              </span>
            </div>
          ) : (
            METRIC_DEFS.filter((d) => cfg[d.key] != null).slice(0, 4).map(({ key, label, unit, max, color }) => (
              <MiniMetricBar key={key} label={label} value={cfg[key] as number} max={max} unit={unit} color={color} />
            ))
          )}
        </div>
      )}

      {/* Info row */}
      <div className="flex items-center gap-3 text-xs text-ink-faint">
        {!isMetrics && <span className="flex items-center gap-1"><Clock size={10} />{sim.interval_seconds}s</span>}
        {!isMetrics && <span className="flex items-center gap-1"><FileText size={10} />{sim.total_lines > 0 ? `${sim.total_lines} lines` : 'No log'}</span>}
        {isMetrics && <span className="flex items-center gap-1"><Activity size={10} />Auto-generated fleet node</span>}
        {sim.metrics_enabled && !isMetrics && (
          <span className="flex items-center gap-1 text-accent"><Activity size={10} />Metrics on</span>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 pt-2 border-t border-hairline-strong/60 flex-wrap">
        {sim.status !== 'running' && (
          <button onClick={() => onAction(sim.id, 'start')}
            disabled={!isMetrics && sim.total_lines === 0}
            title={!isMetrics && sim.total_lines === 0 ? 'No log file attached' : 'Start'}
            className="flex items-center gap-1 px-2 py-1.5 bg-success/10 text-success rounded-lg text-xs font-medium hover:bg-success/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Play size={11} /> Start
          </button>
        )}
        {sim.status === 'running' && (
          <button onClick={() => onAction(sim.id, 'pause')}
            className="flex items-center gap-1 px-2 py-1.5 bg-warning/10 text-warning rounded-lg text-xs font-medium hover:bg-warning/20 transition-colors"
          >
            <Pause size={11} /> Pause
          </button>
        )}
        <button onClick={() => onAction(sim.id, 'stop')}
          className="flex items-center gap-1 px-2 py-1.5 bg-ink/8 text-ink-mute rounded-lg text-xs font-medium hover:bg-ink/15 transition-colors"
        >
          <Square size={11} /> Stop
        </button>
        {!isMetrics && (
          <button onClick={() => onAction(sim.id, 'reset')}
            className="flex items-center gap-1 px-2 py-1.5 bg-info/10 text-info rounded-lg text-xs font-medium hover:bg-info/20 transition-colors"
          >
            <RotateCcw size={11} /> Reset
          </button>
        )}

        <div className="flex-1" />

        {!isMetrics && (
          <button onClick={() => onEditMetrics(sim)} title="Configure metrics"
            className={`p-1.5 rounded-lg transition-colors ${sim.metrics_enabled ? 'bg-accent/10 text-accent hover:bg-accent/20' : 'hover:bg-black/8 text-ink-faint'}`}
          >
            <Activity size={13} />
          </button>
        )}
        {!isMetrics && (
          <button onClick={() => onViewLogs(sim)}
            className="flex items-center gap-0.5 px-2 py-1.5 bg-accent/10 text-accent rounded-lg text-xs font-medium hover:bg-accent/20 transition-colors"
          >
            <Terminal size={11} /><ChevronRight size={10} />
          </button>
        )}
        <button onClick={() => onDelete(sim.id)} title="Delete" className="p-1.5 hover:bg-critical/15 rounded-lg transition-colors">
          <Trash2 size={13} className="text-critical" />
        </button>
      </div>
    </motion.div>
  );
}

/* ── Page ─────────────────────────────────────────────────────── */
export default function Simulators() {
  const { data: simulators, loading, refetch } = usePolling<Simulator[]>(api.getSimulators, 3000);
  const [showCreate, setShowCreate]   = useState(false);
  const [logTarget, setLogTarget]     = useState<Simulator | null>(null);
  const [metricsTarget, setMetricsTarget] = useState<Simulator | null>(null);

  const handleAction = async (id: number, action: string) => {
    try { await api.simulatorAction(id, action); refetch(); } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this simulator?')) return;
    try { await api.deleteSimulator(id); refetch(); } catch (e) { console.error(e); }
  };

  if (loading && !simulators) return <Loader text="Loading simulators…" />;

  const list     = simulators ?? [];
  const running  = list.filter((s) => s.status === 'running').length;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-3 sm:gap-4">
        <div>
          <h1 className="font-display text-[24px] sm:text-[28px] leading-tight text-[var(--color-ink)]">Simulation</h1>
          <p className="text-xs sm:text-sm text-ink-mute mt-0.5">
            EC2 / VM, database, and fleet metrics simulators — stream logs &amp; metrics in real time
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {running > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-success bg-success/10 px-3 py-1.5 rounded-full border border-success/25">
              <span className="w-1.5 h-1.5 rounded-full bg-success pulse-live" />{running} running
            </span>
          )}
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-bright transition-colors shadow-sm"
          >
            <Plus size={15} />New Simulator
          </button>
        </div>
      </div>

      {/* Stats */}
      {list.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total',    value: list.length,                                              color: 'text-ink-soft' },
            { label: 'Running',  value: running,                                                  color: 'text-success' },
            { label: 'Paused',   value: list.filter((s) => s.status === 'paused').length,         color: 'text-warning' },
            { label: 'Fleet',    value: list.filter((s) => s.simulator_type === 'metrics').length, color: 'text-accent' },
          ].map(({ label, value, color }) => (
            <div key={label} className="glass px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-ink-mute">{label}</span>
              <span className={`text-lg font-bold ${color}`}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      {list.length === 0 ? (
        <div className="glass flex flex-col items-center justify-center py-24 text-ink-faint gap-3">
          <Server size={36} className="opacity-25" />
          <p className="text-sm font-medium">No simulators yet</p>
          <p className="text-xs">Create one and upload a log file to start streaming</p>
          <button onClick={() => setShowCreate(true)}
            className="mt-2 flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-bright transition-colors"
          >
            <Plus size={14} />New Simulator
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          <AnimatePresence mode="popLayout">
            {list.map((sim, i) => (
              <motion.div key={sim.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: i * 0.04 }}>
                <SimulatorCard sim={sim} onAction={handleAction} onDelete={handleDelete} onViewLogs={setLogTarget} onEditMetrics={setMetricsTarget} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {showCreate    && <CreateModal onClose={() => setShowCreate(false)} onCreated={refetch} />}
        {metricsTarget && <MetricsEditModal simulator={metricsTarget} onClose={() => setMetricsTarget(null)} onSaved={refetch} />}
        {logTarget     && <LogViewerModal simulator={logTarget} onClose={() => setLogTarget(null)} />}
      </AnimatePresence>
    </motion.div>
  );
}
