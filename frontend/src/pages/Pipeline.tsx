import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye, TrendingUp, Search, Wrench, FileText, Play, Loader2,
  Filter, ChevronDown, AlertTriangle, CheckCircle2,
  XCircle, Clock, Server, RefreshCw, Terminal, RotateCcw,
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import StatusBadge from '../components/ui/StatusBadge';
import Loader from '../components/ui/Loader';
import AutoPipelinePanel from '../components/pipeline/AutoPipelinePanel';
import PipelineResultView from '../components/pipeline/PipelineResultView';
import { useApi } from '../hooks/useApi';
import * as api from '../services/api';
import type { RunPipelineAllSummary } from '../services/api';
import type { InfraNode, PipelineResult, PipelineRunStatus } from '../types';
import { palette } from '../lib/theme';
import { easing } from '../lib/motion';

const AGENT_ICONS: Record<string, React.ElementType> = {
  monitoring: Eye,
  predictive: TrendingUp,
  diagnostic: Search,
  remediation: Wrench,
  reporting: FileText,
};

// Earthy palette aligned with the warm-cream + deep-teal system. Each agent
// keeps a distinct hue but stays within the palette family.
const AGENT_GLOW: Record<string, string> = {
  monitoring:  palette.info,         // calm blue
  predictive:  palette.accentBright, // bright teal
  diagnostic:  palette.plum,         // muted plum
  remediation: palette.warning,      // amber
  reporting:   palette.success,      // green
};

const PIPELINE_STEPS = ['monitoring', 'predictive', 'diagnostic', 'remediation', 'reporting'];

// The run is a 3-stage flow. The stage is DERIVED from existing run state
// (no extra state to keep in sync): running → 'running', a finished
// result/error → 'results', otherwise → 'select'.
type Phase = 'select' | 'running' | 'results';

// Each stage slides in as its own "page"; reduced-motion strips the y via the
// app-level MotionConfig.
const stageVariants = {
  hidden:  { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: easing.outSoft } },
  exit:    { opacity: 0, y: -10, transition: { duration: 0.18, ease: easing.inOutQuart } },
};

const NODE_TYPE_ICONS: Record<string, string> = {
  server: 'S',
  database: 'D',
  load_balancer: 'L',
  cache: 'C',
  queue: 'Q',
};

const STORAGE_KEY = 'itops_pipeline_state';

type PipelineLogEntry = {
  timestamp: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'agent';
};

// The "run all nodes" endpoint returns a fleet-level summary that lives
// in the same UI slot as a single-node PipelineResult. Keeping both in
// one union lets the result panel render either shape without an extra
// state field.
type PipelineResultOrSummary = PipelineResult | RunPipelineAllSummary;

function isRunAllSummary(r: PipelineResultOrSummary | null): r is RunPipelineAllSummary {
  return r !== null && (r as RunPipelineAllSummary).total_nodes !== undefined;
}

interface PersistedPipelineState {
  selectedNode?: string;
  result?: PipelineResultOrSummary | null;
  error?: string | null;
  pipelineRun?: PipelineRunStatus | null;
  elapsedMs?: number;
  logs?: PipelineLogEntry[];
}

function savePipelineState(state: PersistedPipelineState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore quota errors */ }
}

function loadPipelineState(): PersistedPipelineState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedPipelineState) : null;
  } catch {
    return null;
  }
}

function clearPipelineState() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* */ }
}

export default function Pipeline() {
  const { data: nodes, loading: nodesLoading } = useApi<InfraNode[]>(api.getNodes);

  // Restore persisted state on mount
  const saved = useRef(loadPipelineState());

  const [selectedNode, setSelectedNode] = useState<string>(saved.current?.selectedNode || '');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PipelineResultOrSummary | null>(saved.current?.result || null);
  const [error, setError] = useState<string | null>(saved.current?.error || null);
  const [runId, setRunId] = useState<string | null>(null);
  const [pipelineRun, setPipelineRun] = useState<PipelineRunStatus | null>(saved.current?.pipelineRun || null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(saved.current?.elapsedMs || 0);
  const [logs, setLogs] = useState<{ timestamp: number; message: string; type: 'info' | 'success' | 'error' | 'agent' }[]>(saved.current?.logs || []);
  const startTimeRef = useRef(0);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Persist key state to sessionStorage whenever it changes
  useEffect(() => {
    if (running) return; // don't save mid-run state
    savePipelineState({
      selectedNode,
      result,
      error,
      pipelineRun,
      elapsedMs,
      logs,
    });
  }, [selectedNode, result, error, pipelineRun, elapsedMs, logs, running]);

  // Reset everything and show node selection
  const handleSelectNewNode = useCallback(() => {
    setSelectedNode('');
    setResult(null);
    setError(null);
    setRunId(null);
    setPipelineRun(null);
    setRunning(false);
    setElapsedMs(0);
    setLogs([]);
    clearPipelineState();
  }, []);

  // Wrapped in useMemo so the `|| []` fallback identity stays stable
  // across renders — otherwise every downstream useMemo that depends
  // on `nodeList` would recompute even when `nodes` hasn't changed.
  const nodeList = useMemo(() => nodes || [], [nodes]);
  const completedAgents = useMemo(
    () => {
      // agent_trace is only present on single-node runs, not the fleet
      // summary returned by /pipeline/run-all.
      const trace = result && !isRunAllSummary(result) ? result.agent_trace : [];
      const agents = new Set(trace.map((entry) => String(entry.agent)));
      for (const event of pipelineRun?.progress_events ?? []) {
        if (event.phase === 'completed' && event.agent !== 'pipeline') {
          agents.add(String(event.agent));
        }
      }
      return agents;
    },
    [pipelineRun, result],
  );
  const currentAgent = running ? (pipelineRun?.current_agent ?? null) : null;
  const displayedLogs = useMemo(() => {
    if (!pipelineRun) return logs;
    const startedAtMs = new Date(pipelineRun.started_at).getTime();
    return pipelineRun.progress_events.map((event) => ({
      timestamp: Math.max(0, new Date(event.timestamp).getTime() - startedAtMs),
      message: event.message,
      type: (event.phase === 'error'
        ? 'error'
        : event.phase === 'completed'
          ? 'success'
          : 'agent') as 'info' | 'success' | 'error' | 'agent',
    }));
  }, [pipelineRun, logs]);

  // Derive unique types from nodes
  const nodeTypes = useMemo(() => {
    const types = new Set(nodeList.map(n => n.node_type));
    return ['all', ...Array.from(types)];
  }, [nodeList]);

  // Source = the data adapter feeding the node (simulator vs aws cloudwatch, etc).
  // Matches the same field used on the Fleet page so the two filters
  // stay in sync; falls back to provider when older nodes haven't been re-tagged.
  // useCallback keeps the identity stable so downstream useMemos that
  // close over it don't recompute every render.
  const sourceOf = useCallback(
    (n: typeof nodeList[number]) =>
      (n.metadata_?.data_source as string | undefined) ?? n.provider,
    [],
  );

  const nodeSources = useMemo(() => {
    const sources = new Set(nodeList.map(sourceOf));
    return ['all', ...Array.from(sources)];
  }, [nodeList, sourceOf]);

  // Filter nodes based on status, type, and source filters
  const filteredNodes = useMemo(() => {
    return nodeList.filter(n => {
      if (statusFilter !== 'all' && n.status !== statusFilter) return false;
      if (typeFilter !== 'all' && n.node_type !== typeFilter) return false;
      if (sourceFilter !== 'all' && sourceOf(n) !== sourceFilter) return false;
      return true;
    });
  }, [nodeList, statusFilter, typeFilter, sourceFilter, sourceOf]);

  // Selected node object
  const selectedNodeObj = useMemo(
    () => nodeList.find(n => n.node_name === selectedNode) || null,
    [nodeList, selectedNode],
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handler = () => setDropdownOpen(false);
    if (dropdownOpen) {
      document.addEventListener('click', handler);
      return () => document.removeEventListener('click', handler);
    }
  }, [dropdownOpen]);

  // Elapsed timer
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);
    return () => clearInterval(interval);
  }, [running]);

  // Auto-scroll logs
  useEffect(() => {
    logsContainerRef.current?.scrollTo({ top: logsContainerRef.current.scrollHeight, behavior: 'smooth' });
  }, [displayedLogs]);

  useEffect(() => {
    if (!runId) return;

    let cancelled = false;
    let nextPoll: ReturnType<typeof setTimeout> | null = null;

    const syncElapsed = (run: PipelineRunStatus) => {
      const end = new Date(run.completed_at || new Date().toISOString()).getTime();
      const start = new Date(run.started_at).getTime();
      setElapsedMs(Math.max(0, end - start));
    };

    const poll = async () => {
      try {
        const run = await api.getPipelineRun(runId) as PipelineRunStatus;
        if (cancelled) return;

        setPipelineRun(run);
        syncElapsed(run);

        if (run.status === 'completed') {
          setResult(run.result);
          setError(null);
          setRunning(false);
          setRunId(null);
          return;
        }

        if (run.status === 'failed') {
          setResult(run.result);
          setError(run.error || 'Pipeline execution failed');
          setRunning(false);
          setRunId(null);
          return;
        }

        nextPoll = setTimeout(poll, 1000);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to fetch pipeline progress');
        setRunning(false);
        setRunId(null);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (nextPoll) clearTimeout(nextPoll);
    };
  }, [runId]);

  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${s}s`;
  };

  const handleRunPipeline = async () => {
    if (!selectedNode) return;
    setRunning(true);
    setResult(null);
    setError(null);
    setPipelineRun(null);
    setRunId(null);
    setElapsedMs(0);
    startTimeRef.current = Date.now();
    setLogs([]);

    try {
      const started = await api.startPipelineRun({ node_name: selectedNode });
      setRunId(started.run_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pipeline execution failed');
      setPipelineRun(null);
      setRunning(false);
    }
  };

  const handleRunAll = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    setPipelineRun(null);
    setRunId(null);
    setElapsedMs(0);
    startTimeRef.current = Date.now();
    setLogs([]);
    try {
      const res = await api.runPipelineAll();
      const elapsed = Date.now() - startTimeRef.current;
      setResult(res);
      setElapsedMs(elapsed);
      setLogs(prev => [...prev, {
        timestamp: elapsed,
        message: `All-nodes pipeline completed in ${formatElapsed(elapsed)}`,
        type: 'success',
      }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Pipeline execution failed';
      setError(msg);
      setLogs(prev => [...prev, {
        timestamp: Date.now() - startTimeRef.current,
        message: `Pipeline failed: ${msg}`,
        type: 'error',
      }]);
    } finally {
      setRunning(false);
    }
  };

  const statusColor = (s: string) => {
    if (s === 'critical') return 'text-critical bg-critical/10 border-critical/20';
    if (s === 'degraded') return 'text-warning bg-warning/10 border-warning/20';
    if (s === 'healthy') return 'text-success bg-success/10 border-success/20';
    return 'text-ink-faint bg-ink/5 border-hairline-strong';
  };

  if (nodesLoading) return <Loader text="Loading infrastructure nodes…" />;

  const phase: Phase = running ? 'running' : (result || error) ? 'results' : 'select';

  return (
    <div className="space-y-6">
      {/* Header + stage progress */}
      <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-[24px] sm:text-[28px] leading-tight text-[var(--color-ink)]">Run Workflow</h1>
          <p className="text-xs sm:text-sm text-ink-mute mt-1">
            Select a node, watch the agents work, then review the result
          </p>
        </div>
        <StageStepper current={phase} />
      </div>

      <AnimatePresence mode="wait">
        {phase === 'select' && (
          <motion.div
            key="select"
            variants={stageVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="space-y-6"
          >
            {/* ── Automatic execution control ───────────────────────── */}
            <AutoPipelinePanel />

            {/* ── Node Selection + Filters ──────────────────────────── */}
            <div className="grid lg:grid-cols-3 gap-5">
        {/* Filters panel */}
        <GlassCard hover={false} className="lg:col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <Filter size={16} className="text-accent" />
            <h2 className="text-sm font-semibold text-ink-soft">Filters</h2>
          </div>

          <div className="space-y-3">
            {/* Status filter */}
            <div>
              <label className="text-xs text-ink-mute block mb-1.5 font-medium">Node Status</label>
              <div className="flex flex-wrap gap-2">
                {['all', 'critical', 'degraded', 'healthy'].map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${statusFilter === s
                      ? s === 'critical' ? 'bg-critical/15 text-critical border-critical/30'
                        : s === 'degraded' ? 'bg-warning/15 text-warning border-warning/30'
                          : s === 'healthy' ? 'bg-success/15 text-success border-success/30'
                            : 'bg-accent/10 text-accent border-accent/30'
                      : 'bg-ink/5 text-ink-mute border-transparent hover:border-hairline-strong'
                      }`}
                  >
                    {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Type filter */}
            <div>
              <label className="text-xs text-ink-mute block mb-1.5 font-medium">Node Type</label>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="w-full bg-black/5 border border-glass-border rounded-lg px-3 py-2 text-sm text-ink-soft focus:outline-none focus:border-accent/50"
              >
                {nodeTypes.map(t => (
                  <option key={t} value={t}>
                    {t === 'all' ? 'All Types' : t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>

            {/* Source filter — matches the Source dimension on Fleet */}
            <div>
              <label className="text-xs text-ink-mute block mb-1.5 font-medium">Source</label>
              <select
                value={sourceFilter}
                onChange={e => setSourceFilter(e.target.value)}
                className="w-full bg-black/5 border border-glass-border rounded-lg px-3 py-2 text-sm text-ink-soft focus:outline-none focus:border-accent/50"
              >
                {nodeSources.map(s => {
                  const label = s === 'all' ? 'All Sources'
                    : s === 'simulated' ? 'Simulator'
                    : s === 'aws' ? 'AWS CloudWatch'
                    : s === 'azure' ? 'Azure Monitor'
                    : s === 'gcp' ? 'GCP Monitoring'
                    : s;
                  return <option key={s} value={s}>{label}</option>;
                })}
              </select>
            </div>

            {/* Count summary */}
            <div className="pt-2 border-t border-glass-border">
              <p className="text-xs text-ink-mute">
                Showing <b className="text-ink-soft">{filteredNodes.length}</b> of {nodeList.length} nodes
              </p>
            </div>
          </div>
        </GlassCard>

        {/* Node selector */}
        <GlassCard hover={false} className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Server size={16} className="text-accent" />
            <h2 className="text-sm font-semibold text-ink-soft">Select Node</h2>
          </div>

          {/* Custom dropdown */}
          <div className="relative mb-4" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-full flex items-center justify-between bg-black/5 border border-glass-border rounded-lg px-4 py-3 text-sm text-left hover:border-accent/40 transition-colors"
            >
              {selectedNodeObj ? (
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${statusColor(selectedNodeObj.status)}`}>
                    {NODE_TYPE_ICONS[selectedNodeObj.node_type] || 'N'}
                  </span>
                  <div className="min-w-0 truncate">
                    <span className="text-ink font-medium">{selectedNodeObj.node_name}</span>
                    <span className="text-ink-faint ml-2 text-xs hidden sm:inline">({selectedNodeObj.node_type})</span>
                  </div>
                  <span className="ml-auto shrink-0">
                    <StatusBadge status={selectedNodeObj.status} />
                  </span>
                </div>
              ) : (
                <span className="text-ink-faint">Choose a node to run pipeline on…</span>
              )}
              <ChevronDown size={16} className={`text-ink-faint transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {dropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute z-50 top-full mt-1 w-full max-h-64 overflow-y-auto glass-dropdown"
                >
                  {filteredNodes.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-ink-faint">
                      No nodes match the current filters
                    </div>
                  ) : (
                    filteredNodes.map(node => (
                      <button
                        key={node.node_name}
                        onClick={() => { setSelectedNode(node.node_name); setDropdownOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/5 transition-colors ${selectedNode === node.node_name ? 'bg-accent/10' : ''
                          }`}
                      >
                        <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${statusColor(node.status)}`}>
                          {NODE_TYPE_ICONS[node.node_type] || 'N'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-ink font-medium truncate block">{node.node_name}</span>
                          <span className="text-xs text-ink-faint">{node.node_type} &middot; {node.region}</span>
                        </div>
                        <StatusBadge status={node.status} />
                      </button>
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Selected node info + action buttons */}
          {selectedNodeObj && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-gradient-to-r from-canvas-soft to-transparent border border-hairline-strong space-y-3"
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-ink-faint block">Status</span>
                  <StatusBadge status={selectedNodeObj.status} />
                </div>
                <div>
                  <span className="text-ink-faint block mb-1">Type</span>
                  <span className="text-ink-soft font-medium capitalize">{selectedNodeObj.node_type.replace(/_/g, ' ')}</span>
                </div>
                <div>
                  <span className="text-ink-faint block mb-1">Provider</span>
                  <span className="text-ink-soft font-medium">{selectedNodeObj.provider}</span>
                </div>
                <div>
                  <span className="text-ink-faint block mb-1">Region</span>
                  <span className="text-ink-soft font-medium">{selectedNodeObj.region}</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 sm:gap-3 mt-4 flex-wrap">
            <button
              onClick={handleRunPipeline}
              disabled={running || !selectedNode}
              className="flex items-center gap-2 px-4 sm:px-6 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-bright transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Run Workflow
            </button>
            <button
              onClick={handleRunAll}
              disabled={running}
              className="flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-black/5 text-ink-soft rounded-lg text-sm font-medium hover:bg-black/10 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={14} />
              Run All Nodes
            </button>
          </div>
        </GlassCard>
      </div>
          </motion.div>
        )}

        {phase === 'running' && (
          <motion.div
            key="running"
            variants={stageVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col gap-4 sm:gap-5 min-h-[calc(100dvh-220px)]"
          >
            {/* Running header — pinned in view, so it's obvious a run is live */}
            <div className="glass p-4 sm:p-5 flex items-center justify-between gap-3 flex-wrap gpu">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-warning/12 shrink-0">
                  <Loader2 size={18} className="animate-spin text-warning" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-ink truncate">
                    {selectedNodeObj
                      ? `Running pipeline · ${selectedNodeObj.node_name}`
                      : 'Running pipeline · all nodes'}
                  </h2>
                  <p className="text-[11px] text-ink-mute mt-0.5">
                    {currentAgent
                      ? `${currentAgent.charAt(0).toUpperCase() + currentAgent.slice(1)} agent working — results open automatically when it finishes`
                      : 'Starting the agent pipeline — results open automatically when it finishes'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-sm font-mono shrink-0">
                <Clock size={15} className="text-warning animate-pulse" />
                <span className="text-warning numeric">{formatElapsed(elapsedMs)}</span>
              </div>
            </div>

            {/* Agent flow */}
            <div className="glass p-4 sm:p-6 gpu">
              <div className="flex items-center justify-center gap-3 overflow-x-auto pb-2">
          {PIPELINE_STEPS.map((step, i) => {
            const isDone = completedAgents.has(step);
            const isCurrent = currentAgent === step;
            const isPending = !isDone;
            const color = AGENT_GLOW[step] || palette.success;
            const Icon = AGENT_ICONS[step] || Eye;
            return (
              <div key={step} className="flex items-center gap-3 shrink-0">
                <div className="flex flex-col items-center gap-1.5">
                  <motion.div
                    animate={running && isPending ? { opacity: [0.55, 1, 0.55] } : { opacity: 1 }}
                    transition={running && isPending ? { duration: 1.5, repeat: Infinity } : { duration: 0.3 }}
                    className={`relative w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors duration-300 ${isDone ? 'border-success bg-success/10' : isPending ? 'border-hairline-strong bg-canvas-soft/50' : ''
                      }`}
                    style={running && isPending ? {
                      borderColor: `${color}66`,
                      background: `${color}10`,
                    } : {}}
                  >
                    {isDone ? (
                      <CheckCircle2 size={20} className="text-success" />
                    ) : (
                      <Icon size={20} className={running ? 'text-ink-mute' : 'text-ink-faint'} />
                    )}
                  </motion.div>
                  <span className={`text-[11px] font-medium ${isCurrent ? 'text-ink' : isDone ? 'text-success' : 'text-ink-faint'
                    }`}>
                    {step.charAt(0).toUpperCase() + step.slice(1)}
                  </span>
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <div className={`w-10 h-0.5 rounded-full mb-5 transition-colors duration-500 ${isDone ? 'bg-success' : 'bg-hairline-strong'}`} />
                )}
              </div>
            );
          })}
              </div>
            </div>

            {/* Live log — fills the rest of the screen, scrolls internally */}
            <div className="glass p-4 sm:p-5 flex flex-col flex-1 min-h-[240px] gpu">
              <div className="flex items-center gap-2 mb-3 shrink-0">
                <Terminal size={16} className="text-ink-mute" />
                <h2 className="text-sm font-semibold text-ink-soft">Live log</h2>
                <span className="label-eyebrow !text-[9px] ml-auto flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-warning pulse-live" />
                  streaming
                </span>
              </div>
              <div
                ref={logsContainerRef}
                className="terminal-pane rounded-lg p-4 flex-1 min-h-0 overflow-y-auto font-mono text-xs leading-5 space-y-0.5"
              >
            {displayedLogs.map((log, i) => (
              <div key={i} className={`flex gap-3 ${log.type === 'error' ? 'text-critical' :
                log.type === 'success' ? 'text-success' :
                  log.type === 'agent' ? 'text-info' :
                    'text-ink-faint'
                }`}>
                <span className="text-ink-soft shrink-0">[{formatElapsed(log.timestamp)}]</span>
                <span>{log.message}</span>
              </div>
            ))}
            {displayedLogs.length === 0 && (
              <div className="text-ink-faint">Waiting for the first agent to report…</div>
            )}
            {running && (
              <div className="flex gap-3 text-ink-mute">
                <span className="text-ink-soft shrink-0">[{formatElapsed(elapsedMs)}]</span>
                <span className="animate-pulse">█</span>
              </div>
            )}
              </div>
            </div>
          </motion.div>
        )}

        {phase === 'results' && (
          <motion.div
            key="results"
            variants={stageVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="space-y-5"
          >
            {/* Results action bar — what just ran + how to move on */}
            <div className="glass p-3 sm:p-4 flex items-center justify-between gap-3 flex-wrap gpu">
              <div className="flex items-center gap-2.5 min-w-0">
                {error
                  ? <XCircle size={18} className="text-critical shrink-0" />
                  : <CheckCircle2 size={18} className="text-success shrink-0" />}
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-ink truncate">
                    {error ? 'Pipeline error' : 'Pipeline result'}
                    {selectedNodeObj && <span className="text-ink-mute font-normal"> · {selectedNodeObj.node_name}</span>}
                    {!selectedNodeObj && !error && <span className="text-ink-mute font-normal"> · all nodes</span>}
                  </h2>
                  <p className="text-[11px] text-ink-faint mt-0.5 numeric">finished in {formatElapsed(elapsedMs)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedNode ? (
                  <button
                    onClick={handleRunPipeline}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-hairline-strong text-ink-soft text-xs font-medium hover:bg-canvas-soft hover:border-ink/20 transition-colors press-tactile"
                  >
                    <RefreshCw size={13} /> Re-run this node
                  </button>
                ) : (
                  <button
                    onClick={handleRunAll}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-hairline-strong text-ink-soft text-xs font-medium hover:bg-canvas-soft hover:border-ink/20 transition-colors press-tactile"
                  >
                    <RefreshCw size={13} /> Run all again
                  </button>
                )}
                <button
                  onClick={handleSelectNewNode}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-[var(--color-surface)] text-xs font-medium hover:bg-accent-bright transition-colors press-tactile"
                >
                  <RotateCcw size={13} /> Run another node
                </button>
              </div>
            </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <GlassCard hover={false} glow="red">
              <div className="flex items-center gap-3">
                <XCircle size={20} className="text-critical" />
                <div>
                  <h3 className="text-sm font-semibold text-critical">Pipeline Error</h3>
                  <p className="text-xs text-critical mt-0.5">{error}</p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
          >
            {/* Summary card */}
            {(() => {
              const isRunAll = isRunAllSummary(result);
              const anomaliesDetected = isRunAll ? result.anomalies_detected : 0;
              const incidentsCreated = isRunAll ? result.incidents_created : 0;
              const totalNodes = isRunAll ? result.total_nodes : 0;
              const hasAnomaly = isRunAll ? anomaliesDetected > 0 : Boolean(result.is_anomaly);
              const aggregateStatus = isRunAll
                ? (anomaliesDetected > 0 ? 'critical' : 'healthy')
                : (result.status || 'unknown');

              return (
                <GlassCard hover={false} glow={hasAnomaly ? 'red' : 'green'}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-ink-soft">Pipeline Result</h2>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={aggregateStatus} />
                      {!isRunAll && result.severity && <StatusBadge status={result.severity} />}
                    </div>
                  </div>

                  {hasAnomaly ? (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-critical/8 border border-critical/25 mb-4">
                      <AlertTriangle size={18} className="text-critical" />
                      <div>
                        {isRunAll ? (
                          <>
                            <span className="text-sm font-semibold text-critical">
                              {anomaliesDetected} {anomaliesDetected === 1 ? 'Anomaly' : 'Anomalies'} Detected
                            </span>
                            <span className="text-xs text-critical ml-2">
                              across {totalNodes} {totalNodes === 1 ? 'node' : 'nodes'}
                              {incidentsCreated > 0 && ` · ${incidentsCreated} ${incidentsCreated === 1 ? 'incident' : 'incidents'} created`}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-sm font-semibold text-critical">Anomaly Detected</span>
                            {result.incident_id && (
                              <span className="text-xs text-critical ml-2">Incident #{result.incident_id} created</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-success/8 border border-success/25 mb-4">
                      <CheckCircle2 size={18} className="text-success" />
                      <span className="text-sm font-semibold text-success">
                        {isRunAll
                          ? `No Anomalies Across ${totalNodes} ${totalNodes === 1 ? 'Node' : 'Nodes'} — All Clear`
                          : 'No Anomaly — All Clear'}
                      </span>
                    </div>
                  )}

                  {/* Run-All summary */}
                  {isRunAll && (
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="p-3 rounded-lg bg-ink/5">
                        <div className="text-lg font-bold text-ink">{totalNodes}</div>
                        <div className="text-xs text-ink-mute">Nodes Scanned</div>
                      </div>
                      <div className="p-3 rounded-lg bg-critical/8">
                        <div className="text-lg font-bold text-critical">{anomaliesDetected}</div>
                        <div className="text-xs text-ink-mute">Anomalies</div>
                      </div>
                      <div className="p-3 rounded-lg bg-success/8">
                        <div className="text-lg font-bold text-success">{incidentsCreated}</div>
                        <div className="text-xs text-ink-mute">Incidents Created</div>
                      </div>
                    </div>
                  )}
                </GlassCard>
              );
            })()}

            {/* 5-section agent pipeline view — only for single-node runs
                where we have the full per-agent payload. Run-All shows
                just the aggregate summary above. */}
            {!isRunAllSummary(result) && result.monitoring_result &&
              Object.keys(result.monitoring_result).length > 0 && (
              <div className="glass p-5 sm:p-7 gpu">
                <PipelineResultView
                  monitoring={result.monitoring_result}
                  prediction={result.prediction_result}
                  diagnostic={result.diagnostic_result}
                  remediation={result.remediation_result}
                  reporting={result.reporting_result}
                  meta={{
                    status: result.status,
                    severity: result.severity ?? undefined,
                    detected_at: result.started_at,
                    resolved_at: result.completed_at,
                    incident_id: result.incident_id,
                  }}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


/* ── Helper: 3-stage progress stepper ──────────────────────────
   Gives a new user constant orientation — "I'm on stage 2 of 3". */
function StageStepper({ current }: { current: Phase }) {
  const steps: { key: Phase; label: string }[] = [
    { key: 'select',  label: 'Select' },
    { key: 'running', label: 'Running' },
    { key: 'results', label: 'Results' },
  ];
  const idx = steps.findIndex((s) => s.key === current);
  return (
    <div
      className="flex items-center gap-1.5 sm:gap-2"
      role="group"
      aria-label={`Stage ${idx + 1} of 3: ${steps[idx].label}`}
    >
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1.5 sm:gap-2">
          <span className={`flex items-center gap-1.5 text-[11px] font-medium ${
            i === idx ? 'text-ink' : i < idx ? 'text-ink-mute' : 'text-ink-faint'
          }`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-mono ${
              i === idx ? 'bg-accent text-[var(--color-surface)]'
                : i < idx ? 'bg-success/15 text-success'
                : 'bg-ink/8 text-ink-faint'
            }`}>
              {i < idx ? <CheckCircle2 size={11} /> : i + 1}
            </span>
            <span className="hidden sm:inline">{s.label}</span>
          </span>
          {i < steps.length - 1 && (
            <span className={`h-px w-4 sm:w-7 ${i < idx ? 'bg-success/40' : 'bg-hairline-strong'}`} />
          )}
        </div>
      ))}
    </div>
  );
}
