import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, Database, Globe, HardDrive, Radio, X, Terminal, Loader2,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import StatusBadge from '../components/ui/StatusBadge';
import Loader from '../components/ui/Loader';
import Portal from '../components/ui/Portal';
import { usePolling, useApi } from '../hooks/useApi';
import * as api from '../services/api';
import type { InfraNode, MetricSnapshot } from '../types';

const NODE_ICONS: Record<string, React.ElementType> = {
  server: Server,
  database: Database,
  load_balancer: Globe,
  cache: HardDrive,
  queue: Radio,
};

const STATUS_ORDER = ['critical', 'degraded', 'healthy', 'offline'] as const;

const SOURCE_LABELS: Record<string, string> = {
  simulated: 'Simulator',
  aws: 'AWS CloudWatch',
  azure: 'Azure Monitor',
  gcp: 'GCP Monitoring',
  datadog: 'Datadog',
  prometheus: 'Prometheus',
};

function FilterRow({
  label, values, counts, selected, onToggle, onClear, labelFor,
}: {
  label: string;
  values: string[];
  counts: Record<string, number>;
  selected: Set<string>;
  onToggle: (v: string) => void;
  onClear: () => void;
  labelFor?: (v: string) => string;
}) {
  if (values.length === 0) return null;
  const pill = (active: boolean) =>
    `px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${active
      ? 'bg-accent text-white'
      : 'bg-black/5 text-ink-mute hover:bg-black/10'}`;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[11px] font-medium text-ink-faint w-14 shrink-0">{label}</span>
      <button onClick={onClear} className={pill(selected.size === 0)}>All</button>
      {values.map((v) => (
        <button key={v} onClick={() => onToggle(v)} className={pill(selected.has(v))}>
          {labelFor ? labelFor(v) : v} {counts[v] > 0 ? `(${counts[v]})` : ''}
        </button>
      ))}
    </div>
  );
}

export default function Infrastructure() {
  const { data: nodes, loading } = usePolling<InfraNode[]>(api.getNodes, 10000);
  const [selectedNode, setSelectedNode] = useState<InfraNode | null>(null);
  const [logsNode, setLogsNode] = useState<InfraNode | null>(null);
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set());
  const [typeSel, setTypeSel] = useState<Set<string>>(new Set());
  const [sourceSel, setSourceSel] = useState<Set<string>>(new Set());

  if (loading && !nodes) return <Loader text="Loading infrastructure..." />;

  const all = nodes ?? [];

  // Filter values are derived from the data present, so empty dimensions
  // (e.g. no Azure nodes) never render a dead pill.
  const sourceOf = (n: InfraNode): string =>
    (n.metadata_?.data_source as string | undefined) ?? n.provider;

  const statusValues = STATUS_ORDER.filter((s) => all.some((n) => n.status === s));
  const typeValues = [...new Set(all.map((n) => n.node_type))].sort();
  const sourceValues = [...new Set(all.map(sourceOf))].sort();

  const countBy = (pick: (n: InfraNode) => string) =>
    all.reduce<Record<string, number>>((acc, n) => {
      const k = pick(n);
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
  const statusCounts = countBy((n) => n.status);
  const typeCounts = countBy((n) => n.node_type);
  const sourceCounts = countBy(sourceOf);

  // OR within a dimension (empty set = unconstrained), AND across dimensions.
  const filtered = all.filter((n) =>
    (statusSel.size === 0 || statusSel.has(n.status)) &&
    (typeSel.size === 0 || typeSel.has(n.node_type)) &&
    (sourceSel.size === 0 || sourceSel.has(sourceOf(n)))
  );

  const anyActive = statusSel.size + typeSel.size + sourceSel.size > 0;

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (v: string) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });

  const clearAll = () => {
    setStatusSel(new Set());
    setTypeSel(new Set());
    setSourceSel(new Set());
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-3 sm:gap-4">
          <div>
            <h1 className="font-display text-[24px] sm:text-[28px] leading-tight text-[var(--color-ink)]">Infrastructure</h1>
            <p className="text-xs sm:text-sm text-ink-mute mt-1">Monitored nodes and their metric histories</p>
          </div>
          <div className="text-xs text-ink-faint">
            {filtered.length === all.length ? `${all.length} nodes` : `${filtered.length} of ${all.length} nodes`}
            {anyActive && (
              <button onClick={clearAll} className="ml-3 text-accent hover:underline">Clear filters</button>
            )}
          </div>
        </div>
        <div className="glass-sm p-3 space-y-2">
          <FilterRow label="Status" values={statusValues as unknown as string[]} counts={statusCounts}
            selected={statusSel} onToggle={toggle(setStatusSel)} onClear={() => setStatusSel(new Set())} />
          <FilterRow label="Type" values={typeValues} counts={typeCounts}
            selected={typeSel} onToggle={toggle(setTypeSel)} onClear={() => setTypeSel(new Set())} />
          <FilterRow label="Source" values={sourceValues} counts={sourceCounts}
            selected={sourceSel} onToggle={toggle(setSourceSel)} onClear={() => setSourceSel(new Set())}
            labelFor={(v) => SOURCE_LABELS[v] ?? v} />
        </div>
      </div>

      {/* ── Node grid ─────────────────────────────────────────── */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((node, i) => {
          const Icon = NODE_ICONS[node.node_type] || Server;
          return (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              whileHover={{ scale: 1.02 }}
              onClick={() => setSelectedNode(node)}
              className={`glass p-4 cursor-pointer space-y-3 ${node.status === 'critical' ? 'border-critical/30 glow-red' :
                node.status === 'degraded' ? 'border-warning/30 glow-amber' :
                  node.status === 'offline' ? 'border-ink-faint/20 opacity-60' : ''
                }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${node.status === 'healthy' ? 'bg-success/15' :
                    node.status === 'degraded' ? 'bg-warning/15' :
                      node.status === 'offline' ? 'bg-ink/8' : 'bg-critical/15'
                    }`}>
                    <Icon size={16} className={
                      node.status === 'healthy' ? 'text-success' :
                        node.status === 'degraded' ? 'text-warning' :
                          node.status === 'offline' ? 'text-ink-faint' : 'text-critical'
                    } />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink">{node.node_name}</p>
                    <p className="text-[10px] text-ink-faint">{node.node_type} &middot; {node.region}</p>
                  </div>
                </div>
                <StatusBadge status={node.status} pulse={node.status !== 'healthy'} />
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-ink-faint flex-wrap">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="px-1.5 py-0.5 rounded-md bg-black/5 text-ink-mute text-[10px] font-medium">
                    {SOURCE_LABELS[sourceOf(node)] ?? sourceOf(node)}
                  </span>
                  {node.ip_address && <span className="truncate">{node.ip_address}</span>}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setLogsNode(node); }}
                  title="View recent log entries for this node"
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#13171a] text-[#7fb3a3] hover:bg-[#0e1112] hover:text-[#9fcab9] ring-1 ring-white/10 hover:ring-[#7fb3a3]/40 text-[10px] font-mono font-medium transition-all shrink-0"
                >
                  <Terminal size={11} />
                  <span>View Logs</span>
                </button>
              </div>
            </motion.div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-16 text-ink-faint">
            <Server size={32} className="mx-auto mb-3 opacity-30" />
            <p>{all.length === 0 ? 'No nodes registered yet.' : 'No nodes match the active filters.'}</p>
          </div>
        )}
      </div>

      {/* ── Node detail modal ─────────────────────────────────── */}
      <AnimatePresence>
        {selectedNode && (
          <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />
        )}
        {logsNode && (
          <NodeLogsModal node={logsNode} onClose={() => setLogsNode(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  CRITICAL: 'text-[#e0726c]',
  ERROR:    'text-[#e0726c]',
  WARN:     'text-[#dba94f]',
  WARNING:  'text-[#dba94f]',
  INFO:     'text-[#7fb3a3]',
  DEBUG:    'text-[#7fa3c4]',
};

function NodeLogsModal({ node, onClose }: { node: InfraNode; onClose: () => void }) {
  const { data: logs, loading } = useApi<Array<{
    id: number; timestamp: string | null; level: string; source: string; message: string;
  }>>(() => api.getNodeLogs(node.id, 200), [node.id]);

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
          <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 border-b border-hairline-strong/60 shrink-0 flex-wrap">
            <Terminal size={15} className="text-ink-faint shrink-0" />
            <span className="font-semibold text-ink text-sm truncate">{node.node_name}</span>
            <span className="text-[10px] text-ink-faint uppercase tracking-wide">logs</span>
            <span className="ml-auto text-[11px] text-ink-faint">
              {loading ? 'loading…' : `${logs?.length ?? 0} lines`}
            </span>
            <button onClick={onClose} className="p-2 hover:bg-black/8 rounded-lg">
              <X size={18} className="text-ink-mute" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-[#0e1112] font-mono text-[11px] leading-relaxed p-3 sm:p-4">
            {loading && (
              <div className="flex items-center gap-2 text-[#7fb3a3]">
                <Loader2 size={12} className="animate-spin" /> Fetching logs…
              </div>
            )}
            {!loading && (logs?.length ?? 0) === 0 && (
              <div className="text-[#7fa3c4]/60 italic">
                No stored logs for this node yet.
                {' '}This view shows lines captured by the data-source adapter (e.g. CloudWatch).
                {' '}Simulator nodes stream live and don't persist into this store.
              </div>
            )}
            {(logs ?? []).slice().reverse().map((l) => {
              const ts = l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : '--:--:--';
              const color = LOG_LEVEL_COLORS[l.level?.toUpperCase()] || 'text-[#9aa6ab]';
              return (
                <div key={l.id} className="whitespace-pre-wrap break-words">
                  <span className="text-[#5b6770]">{ts}</span>{' '}
                  <span className={`${color} font-semibold`}>[{l.level}]</span>{' '}
                  <span className="text-[#7fa3c4]">{l.source}</span>{' '}
                  <span className="text-[#cfd6da]">{l.message}</span>
                </div>
              );
            })}
          </div>
        </motion.div>
      </motion.div>
    </Portal>
  );
}

function NodeDetail({ node, onClose }: { node: InfraNode; onClose: () => void }) {
  const { data: metrics, loading } = useApi<MetricSnapshot[]>(
    () => api.getNodeMetrics(node.id, 100), [node.id]
  );

  const chartData = metrics?.slice().reverse().map(m => ({
    time: new Date(m.timestamp).toLocaleTimeString(),
    cpu: m.cpu_percent,
    mem: m.memory_percent,
    disk: m.disk_percent,
    err: m.error_rate,
    lat: m.latency_ms,
  })) || [];

  const CHARTS = [
    { key: 'cpu',  label: 'CPU %',        color: '#244745' }, // accent (deep teal)
    { key: 'mem',  label: 'Memory %',     color: '#3a6f6a' }, // accent-bright
    { key: 'disk', label: 'Disk %',       color: '#3a5a7d' }, // info (calm blue)
    { key: 'err',  label: 'Error Rate %', color: '#c08a3e' }, // warning (amber)
    { key: 'lat',  label: 'Latency ms',   color: '#15191a' }, // ink (charcoal)
  ];

  return (
    <Portal>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="sheet-backdrop flex items-start justify-center pt-10 sm:pt-20 px-3 sm:px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="glass-modal w-full max-w-3xl max-h-[85vh] sm:max-h-[75vh] overflow-y-auto p-4 sm:p-6 space-y-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-ink truncate">{node.node_name}</h2>
            <p className="text-[11px] sm:text-xs text-ink-mute break-words">{node.node_type} &middot; {SOURCE_LABELS[(node.metadata_?.data_source as string) ?? node.provider] ?? node.provider} &middot; {node.region} &middot; {node.ip_address}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-black/8 rounded-lg transition-colors">
            <X size={18} className="text-ink-mute" />
          </button>
        </div>

        <StatusBadge status={node.status} pulse={node.status !== 'healthy'} />

        {loading ? <Loader text="Loading metrics..." /> : (
          <div className="grid sm:grid-cols-2 gap-4">
            {CHARTS.map(ch => (
              <div key={ch.key} className="glass-sm p-3">
                <span className="text-xs text-ink-mute block mb-2">{ch.label}</span>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={100}>
                    <LineChart data={chartData}>
                      <XAxis dataKey="time" hide />
                      <YAxis hide domain={['auto', 'auto']} />
                      <Tooltip
                        contentStyle={{
                          background: 'rgba(255,253,247,0.95)',
                          border: '1px solid rgba(21,25,26,0.10)',
                          borderRadius: 8,
                          fontSize: 11,
                          fontFamily: 'JetBrains Mono, monospace',
                          boxShadow: '0 8px 20px -8px rgba(21,25,26,0.20)',
                        }}
                      />
                      <Line type="monotone" dataKey={ch.key} stroke={ch.color} strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[100px] flex items-center justify-center text-xs text-ink-soft">No data</div>
                )}
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
    </Portal>
  );
}
