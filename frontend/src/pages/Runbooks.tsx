import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Search, Hash, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  X, Wrench, Shield, FileText, Copy, Check, ExternalLink, Trash2, Pencil, Plus,
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import Loader from '../components/ui/Loader';
import { runbookDraft, RUNBOOKS_CHANGED_EVENT } from '../hooks/useRunbookDraft';
import { usePolling } from '../hooks/useApi';
import * as api from '../services/api';
import type { RunbookEntry } from '../types';
import { palette } from '../lib/theme';

type SeedFilter = 'all' | 'seeded' | 'auto';
type SortKey = 'effectiveness' | 'usage' | 'newest';

interface SearchResult {
  document?: string;
  metadata?: Record<string, unknown>;
  distance?: number;
}

/* ── helpers ─────────────────────────────────────────────────── */

function relevancePct(distance: number | undefined): number {
  if (distance == null || !Number.isFinite(distance)) return 0;
  const v = Math.max(0, Math.min(1, distance));
  return Math.round((1 - v) * 100);
}

function relevanceLabel(pct: number): { label: string; color: string } {
  if (pct >= 75) return { label: 'Best match', color: palette.success };
  if (pct >= 40) return { label: 'Strong match', color: palette.warning };
  return { label: 'Possible match', color: palette.inkFaint };
}

/* ── copy-to-clipboard hook ──────────────────────────────────── */
function useCopy(timeoutMs = 1500) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), timeoutMs);
    });
  }, [timeoutMs]);
  return { copied, copy };
}

/* ── effectiveness bar ───────────────────────────────────────── */
function EffectivenessBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, (score / 10) * 100));
  const color = pct >= 70 ? palette.success : pct >= 40 ? palette.warning : palette.critical;
  return (
    <div
      className="flex items-center gap-1.5"
      title={`Effectiveness: ${score.toFixed(1)} / 10 — how well this runbook has resolved past incidents`}
    >
      <div className="w-14 h-1.5 rounded-full bg-ink/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono text-ink-soft">{score.toFixed(1)}</span>
    </div>
  );
}

/* ── search result card ──────────────────────────────────────── */
function SearchResultCard({
  result,
  index,
  onJump,
}: {
  result: SearchResult;
  index: number;
  onJump?: (runbookId: number) => void;
}) {
  const pct = relevancePct(result.distance);
  const { label, color } = relevanceLabel(pct);

  // Prefer structured title from metadata over raw text parsing
  const title = result.metadata?.title
    ? String(result.metadata.title)
    : (result.document?.split(/\r?\n/).find(l => l.trim()) ?? '(no preview)');

  const runbookId = result.metadata?.runbook_id != null
    ? Number(result.metadata.runbook_id)
    : null;

  const canJump = runbookId != null && onJump != null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className={`glass-sm p-3.5 space-y-1.5 ${canJump ? 'cursor-pointer hover-row' : ''}`}
      onClick={canJump ? () => onJump!(runbookId!) : undefined}
      title={canJump ? 'Click to jump to this runbook' : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
            style={{ background: `${color}1a`, color }}
          >
            <BookOpen size={12} />
          </div>
          <span className="text-xs font-medium text-ink-soft truncate">{title}</span>
          {canJump && (
            <ExternalLink size={10} className="text-ink-faint shrink-0" />
          )}
        </div>
        <span
          className="text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0"
          style={{ background: `${color}15`, color, border: `1px solid ${color}33` }}
          title={`Computed from semantic similarity with your query — ${label.toLowerCase()}`}
        >
          {pct}% · {label}
        </span>
      </div>
    </motion.div>
  );
}

/* ── copy button ─────────────────────────────────────────────── */
function CopyButton({ text, label = 'Copy steps' }: { text: string; label?: string }) {
  const { copied, copy } = useCopy();
  return (
    <button
      onClick={() => copy(text)}
      title={label}
      className="flex items-center gap-1 text-[10px] text-ink-faint hover:text-ink-soft transition-colors px-1.5 py-0.5 rounded hover:bg-ink/5"
    >
      {copied ? <Check size={10} className="text-success" /> : <Copy size={10} />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

/* ── runbook card ────────────────────────────────────────────── */
function RunbookCard({
  rb,
  isOpen,
  onToggle,
  onEdit,
  onDelete,
}: {
  rb: RunbookEntry;
  isOpen: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const remediationSteps = (rb.remediation_steps ?? []) as Array<Record<string, unknown>>;
  const recommendedActions = (rb.recommended_actions ?? []) as Array<Record<string, unknown>>;
  const blastSeverityColor =
    rb.blast_radius_severity === 'critical' ? palette.critical :
    rb.blast_radius_severity === 'high'     ? palette.warning :
    rb.blast_radius_severity === 'medium'   ? palette.warning :
    palette.success;

  // Build plain-text copy payload for fix steps
  const fixStepsText = remediationSteps.length > 0
    ? remediationSteps.map((s, i) =>
        `${i + 1}. ${s['action'] ?? ''}${s['description'] ? '\n   ' + s['description'] : ''}`
      ).join('\n')
    : rb.solution_steps ?? '';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass overflow-hidden"
      id={`runbook-${rb.id}`}
    >
      {/* Header row */}
      <div
        onClick={onToggle}
        className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 cursor-pointer hover-row"
      >
        <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
          <BookOpen size={15} className="text-accent" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm text-ink font-medium truncate">{rb.title}</p>
            {rb.is_seeded ? (
              <span
                className="text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-info/12 text-info border border-info/25"
                title="Seeded canonical runbook shipped with the system"
              >
                Seeded
              </span>
            ) : (
              <span
                className="text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-success/12 text-success border border-success/25"
                title="Learned from a real resolved incident"
              >
                Learned
              </span>
            )}
            {rb.issue_type && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-ink/8 text-ink-soft font-mono"
                title="Issue category this runbook applies to"
              >
                {rb.issue_type.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          <p className="text-xs text-ink-faint mt-0.5 truncate">{rb.problem_pattern}</p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {rb.source_incident_id != null && (
            <span
              className="hidden sm:flex items-center gap-1 text-xs text-ink-faint"
              title={`Generated from incident #${rb.source_incident_id}`}
            >
              <Hash size={10} />{rb.source_incident_id}
            </span>
          )}
          <div className="hidden sm:block">
            <EffectivenessBar score={rb.effectiveness_score} />
          </div>
          <span
            className="hidden sm:inline text-xs text-ink-mute"
            title="How many times this runbook has been retrieved or applied"
          >
            {rb.times_used} {rb.times_used === 1 ? 'apply' : 'applies'}
          </span>
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-1 rounded hover:bg-accent/10"
              title="Edit this runbook"
            >
              <Pencil size={12} className="text-ink-mute hover:text-accent" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1 rounded hover:bg-critical/10"
              title="Delete this runbook"
            >
              <Trash2 size={12} className="text-critical/70 hover:text-critical" />
            </button>
          )}
          {isOpen ? <ChevronUp size={14} className="text-ink-faint" /> : <ChevronDown size={14} className="text-ink-faint" />}
        </div>
      </div>

      {/* Expanded body */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-glass-border pt-4 space-y-4">
              {/* Problem pattern */}
              <div>
                <span
                  className="text-xs font-semibold text-ink-soft block mb-1"
                  title="The pattern of symptoms or anomalies that triggers this runbook"
                >
                  Problem pattern
                </span>
                <p className="text-xs text-ink-mute bg-canvas-soft p-3 rounded-lg leading-relaxed">{rb.problem_pattern}</p>
              </div>

              {/* Root cause */}
              {rb.root_cause && (
                <div>
                  <span className="text-xs font-semibold text-ink-soft block mb-1">Root cause</span>
                  <p className="text-xs text-ink-mute bg-accent/8 p-3 rounded-lg leading-relaxed">{rb.root_cause}</p>
                </div>
              )}

              {/* Causal chain */}
              {rb.causal_chain && rb.causal_chain.length > 0 && (
                <div>
                  <span
                    className="text-xs font-semibold text-ink-soft block mb-1"
                    title="The sequence of events that leads to this issue"
                  >
                    Causal chain
                  </span>
                  <ol className="space-y-1.5">
                    {rb.causal_chain.map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-ink-soft">
                        <span className="w-5 h-5 rounded-full bg-ink/8 flex items-center justify-center text-[10px] font-mono text-ink-mute shrink-0 mt-px">
                          {i + 1}
                        </span>
                        <span className="leading-relaxed pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Blast radius */}
              {rb.blast_radius && rb.blast_radius.length > 0 && (
                <div>
                  <span
                    className="text-xs font-semibold text-ink-soft block mb-1.5"
                    title="Systems and services that could be affected by this issue"
                  >
                    Blast radius
                    {rb.blast_radius_severity && (
                      <span
                        className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded"
                        style={{
                          background: `${blastSeverityColor}15`,
                          color: blastSeverityColor,
                          border: `1px solid ${blastSeverityColor}33`,
                        }}
                      >
                        {rb.blast_radius_severity}
                      </span>
                    )}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {rb.blast_radius.map((s, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-md text-[11px]"
                        style={{
                          background: `${blastSeverityColor}10`,
                          color: blastSeverityColor,
                          border: `1px solid ${blastSeverityColor}26`,
                        }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommended actions */}
              {recommendedActions.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Shield size={12} className="text-accent" />
                    <span className="text-xs font-semibold text-ink-soft">Recommended actions</span>
                  </div>
                  <div className="space-y-1.5">
                    {recommendedActions.map((act, i) => {
                      const action = String(act['action'] ?? `Action ${i + 1}`);
                      const description = act['description'] ? String(act['description']) : '';
                      return (
                        <div key={i} className="bg-warning/8 border border-warning/20 rounded-lg px-3 py-2">
                          <div className="text-xs font-medium text-ink-soft">{action}</div>
                          {description && (
                            <div className="text-[11.5px] text-ink-mute mt-1 leading-relaxed">{description}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Remediation summary */}
              {rb.remediation_summary && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Wrench size={12} className="text-warning" />
                    <span className="text-xs font-semibold text-ink-soft">Fix summary</span>
                  </div>
                  <p className="text-xs text-ink-mute bg-warning/8 p-3 rounded-lg leading-relaxed">{rb.remediation_summary}</p>
                </div>
              )}

              {/* Remediation steps */}
              {remediationSteps.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-ink-soft">Fix steps</span>
                    {fixStepsText && <CopyButton text={fixStepsText} label="Copy steps" />}
                  </div>
                  <ol className="space-y-1.5">
                    {remediationSteps.map((step, i) => {
                      const action = String(step['action'] ?? `Step ${i + 1}`);
                      const description = step['description'] ? String(step['description']) : '';
                      return (
                        <li key={i} className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-warning/15 flex items-center justify-center text-[10px] font-mono text-warning shrink-0 mt-px">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-ink-soft">{action}</div>
                            {description && (
                              <div className="text-[11.5px] text-ink-mute mt-0.5 leading-relaxed">{description}</div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}

              {/* Fallback raw solution_steps — only when structured fields are empty */}
              {!rb.remediation_summary && remediationSteps.length === 0 && rb.solution_steps && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <FileText size={12} className="text-ink-mute" />
                      <span className="text-xs font-semibold text-ink-soft">Solution</span>
                    </div>
                    <CopyButton text={rb.solution_steps} label="Copy" />
                  </div>
                  <pre className="text-xs text-ink-mute bg-canvas-soft p-3 rounded-lg whitespace-pre-wrap font-sans leading-relaxed">
                    {rb.solution_steps}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
export default function Runbooks() {
  const { data: runbooks, loading, refetch } = usePolling<RunbookEntry[]>(api.getRunbooks, 15000);
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`Delete runbook "${title}"?\n\nThis removes it from the database and the search index. Seeded runbooks cannot be deleted.`)) return;
    try {
      await api.deleteRunbook(id);
      refetch();
    } catch (e: any) {
      alert(`Delete failed: ${e?.message ?? e}`);
    }
  };

  const handlePurge = async () => {
    if (!confirm('Purge log entries emitted by iTOps itself?\n\nThis cleans up old self-emitted lines that were ingested before the loop fix, so the monitoring agent stops re-detecting them as critical.')) return;
    setPurging(true);
    setPurgeMsg(null);
    try {
      const res = await api.purgeSelfEmittedLogs();
      setPurgeMsg(`Purged ${res.deleted} self-emitted log lines.`);
    } catch (e: any) {
      setPurgeMsg(`Failed: ${e?.message ?? e}`);
    } finally {
      setPurging(false);
    }
  };

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  // List controls
  const [seedFilter, setSeedFilter] = useState<SeedFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('effectiveness');
  const [titleFilter, setTitleFilter] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // The runbook form is a single global modal (mounted in Layout) so it can
  // also be opened from an Argus chat draft. Refetch the list when it saves.
  useEffect(() => {
    const onChanged = () => refetch();
    window.addEventListener(RUNBOOKS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(RUNBOOKS_CHANGED_EVENT, onChanged);
  }, [refetch]);

  // Pagination
  const PAGE_SIZE = 50;
  const [rbPage, setRbPage] = useState(1);

  const allRunbooks = runbooks || [];

  // Derive filtered + sorted list
  const filteredSorted = useMemo(() => {
    let list = allRunbooks;
    if (seedFilter === 'seeded') list = list.filter(rb => rb.is_seeded);
    if (seedFilter === 'auto')   list = list.filter(rb => !rb.is_seeded);
    if (titleFilter.trim()) {
      const q = titleFilter.trim().toLowerCase();
      list = list.filter(rb =>
        rb.title.toLowerCase().includes(q) ||
        (rb.issue_type ?? '').toLowerCase().includes(q) ||
        rb.problem_pattern.toLowerCase().includes(q),
      );
    }
    const sorted = [...list];
    if (sortKey === 'effectiveness') sorted.sort((a, b) => b.effectiveness_score - a.effectiveness_score);
    if (sortKey === 'usage')         sorted.sort((a, b) => b.times_used - a.times_used);
    if (sortKey === 'newest') {
      sorted.sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
    }
    return sorted;
  }, [allRunbooks, seedFilter, sortKey, titleFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  const paginatedRunbooks = useMemo(() => {
    const start = (rbPage - 1) * PAGE_SIZE;
    return filteredSorted.slice(start, start + PAGE_SIZE);
  }, [filteredSorted, rbPage]);

  // Reset page when filters change or list shrinks — useEffect, not useMemo
  useEffect(() => {
    if (rbPage > totalPages) setRbPage(1);
  }, [totalPages, rbPage]);

  const counts = {
    all: allRunbooks.length,
    seeded: allRunbooks.filter(rb => rb.is_seeded).length,
    auto:   allRunbooks.filter(rb => !rb.is_seeded).length,
  };

  // Jump from a search result to the actual runbook card
  const jumpToRunbook = useCallback((runbookId: number) => {
    // Find where in filteredSorted this runbook lives
    const idx = filteredSorted.findIndex(rb => rb.id === runbookId);
    if (idx === -1) {
      // It exists but may be filtered out — reset filters and try again on next render
      setSeedFilter('all');
      setTitleFilter('');
      setExpandedId(runbookId);
      return;
    }
    const targetPage = Math.floor(idx / PAGE_SIZE) + 1;
    setRbPage(targetPage);
    setExpandedId(runbookId);
    // Scroll after state update
    setTimeout(() => {
      document.getElementById(`runbook-${runbookId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 120);
  }, [filteredSorted, PAGE_SIZE]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await api.searchMemory(searchQuery, 'runbooks');
      const list = (res.results || []) as SearchResult[];
      list.sort((a, b) => (a.distance ?? 1) - (b.distance ?? 1));
      setSearchResults(list);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  if (loading && !runbooks) return <Loader text="Loading runbooks…" />;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-3 sm:gap-4">
        <div>
          <h1 className="font-display text-[24px] sm:text-[28px] leading-tight text-[var(--color-ink)]">Runbooks</h1>
          <p className="text-xs sm:text-sm text-ink-mute mt-1">
            Playbooks for known issues — seeded canonical runbooks plus learned ones from past resolved incidents.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => runbookDraft.openCreate()}
              className="rounded-lg px-3 py-1.5 text-xs font-medium bg-accent text-white hover:bg-accent-bright flex items-center gap-1.5"
              title="Author a new canonical runbook"
            >
              <Plus size={13} /> New runbook
            </button>
            <button
              onClick={handlePurge}
              disabled={purging}
              className="glass-sm rounded-lg px-3 py-1.5 text-xs text-ink-soft hover:bg-critical/10 hover:text-critical disabled:opacity-50 flex items-center gap-1.5"
              title="Remove log entries emitted by iTOps itself (one-shot cleanup of the pre-fix feedback loop)"
            >
              <Trash2 size={12} />
              {purging ? 'Purging…' : 'Purge self-emitted logs'}
            </button>
          </div>
          {purgeMsg && (
            <span className="text-[10px] text-ink-faint">{purgeMsg}</span>
          )}
        </div>
      </div>

      {/* ── Find a fix (RAG search) ──────────────────────────── */}
      <GlassCard hover={false}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-soft">Find a fix</h2>
            <p className="text-[11px] text-ink-faint mt-0.5">
              Describe what you’re seeing — the system searches memory for the closest match. Click a result to jump to that runbook.
            </p>
          </div>
        </div>

        {/* Search input */}
        <div className="flex gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
          <div className="flex-1 min-w-[180px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder='e.g. "memory leak on java service" or "disk full"'
              className="w-full bg-black/5 border border-glass-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/50"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            className="flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-bright transition-colors disabled:opacity-40 shrink-0"
          >
            {searching ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : <Search size={14} />}
            Search
          </button>
          {searchResults && (
            <button
              onClick={clearSearch}
              title="Clear search results"
              className="flex items-center gap-1 px-3 py-2.5 bg-black/5 text-ink-mute rounded-lg text-sm font-medium hover:bg-black/10 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Search results */}
        <AnimatePresence>
          {searchResults && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 space-y-2"
            >
              {searchResults.length === 0 ? (
                <div className="text-center py-6 text-xs text-ink-faint">
                  <Search size={20} className="mx-auto mb-2 opacity-30" />
                  No matches for "<b className="text-ink-soft">{searchQuery}</b>" in runbooks.
                </div>
              ) : (
                <>
                  <p className="text-[11px] text-ink-faint px-1">
                    {searchResults.length} match{searchResults.length === 1 ? '' : 'es'} — sorted by relevance · click to jump
                  </p>
                  {searchResults.map((r, i) => (
                    <SearchResultCard
                      key={i}
                      result={r}
                      index={i}
                      onJump={jumpToRunbook}
                    />
                  ))}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* ── Runbook list ─────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-soft">All runbooks</h2>
            <p className="text-[11px] text-ink-faint mt-0.5">
              {filteredSorted.length === counts.all
                ? `${counts.all} total · ${counts.seeded} seeded · ${counts.auto} learned`
                : `${filteredSorted.length} of ${counts.all} matching`}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Seed filter pills */}
            <div className="flex items-center gap-1 bg-black/5 rounded-lg p-1">
              {([
                { key: 'all',    label: 'All',    hint: 'Show all runbooks' },
                { key: 'seeded', label: 'Seeded', hint: 'Only canonical runbooks shipped with the system' },
                { key: 'auto',   label: 'Learned', hint: 'Only runbooks created from real resolved incidents' },
              ] as const).map(({ key, label, hint }) => (
                <button
                  key={key}
                  onClick={() => { setSeedFilter(key); setRbPage(1); }}
                  title={hint}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    seedFilter === key ? 'bg-[var(--color-surface-strong)] text-ink shadow-sm' : 'text-ink-mute hover:text-ink-soft'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Sort */}
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              title="How to order the runbook list"
              className="bg-black/5 border border-glass-border rounded-lg px-2.5 py-1.5 text-[11.5px] text-ink-soft focus:outline-none focus:border-accent/40"
            >
              <option value="effectiveness">Sort: Most effective</option>
              <option value="usage">Sort: Most used</option>
              <option value="newest">Sort: Newest first</option>
            </select>

            {/* Title filter */}
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                value={titleFilter}
                onChange={e => { setTitleFilter(e.target.value); setRbPage(1); }}
                placeholder="Filter the list…"
                title="Filter the visible runbooks by title, issue type, or problem pattern (separate from the RAG search above)"
                className="bg-black/5 border border-glass-border rounded-lg pl-7 pr-3 py-1.5 text-[11.5px] text-ink-soft placeholder:text-ink-faint focus:outline-none focus:border-accent/40 w-44"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {paginatedRunbooks.map(rb => (
            <RunbookCard
              key={rb.id}
              rb={rb}
              isOpen={expandedId === rb.id}
              onToggle={() => setExpandedId(expandedId === rb.id ? null : rb.id)}
              onEdit={() => runbookDraft.openEntry(rb)}
              onDelete={() => handleDelete(rb.id, rb.title)}
            />
          ))}

          {filteredSorted.length === 0 && allRunbooks.length === 0 && (
            <div className="text-center py-16 text-ink-faint">
              <BookOpen size={32} className="mx-auto mb-3 opacity-30" />
              <p>No runbooks yet.</p>
              <p className="text-xs mt-1">Runbooks are auto-created when an incident is resolved by the pipeline.</p>
            </div>
          )}

          {filteredSorted.length === 0 && allRunbooks.length > 0 && (
            <div className="text-center py-12 text-ink-faint">
              <Search size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No runbooks match your filters.</p>
              <button
                onClick={() => { setSeedFilter('all'); setTitleFilter(''); }}
                className="text-xs text-accent mt-2 hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 flex-wrap gap-3">
              <p className="text-xs text-ink-faint">
                Showing <b className="text-ink-soft">{(rbPage - 1) * PAGE_SIZE + 1}–{Math.min(rbPage * PAGE_SIZE, filteredSorted.length)}</b> of <b className="text-ink-soft">{filteredSorted.length}</b>
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRbPage(p => Math.max(1, p - 1))}
                  disabled={rbPage <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-glass-border text-xs font-medium text-ink-soft hover:bg-accent/5 hover:border-accent/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={14} />
                  Previous
                </button>
                <span className="text-xs text-ink-mute font-medium px-2">
                  Page {rbPage} of {totalPages}
                </span>
                <button
                  onClick={() => setRbPage(p => Math.min(totalPages, p + 1))}
                  disabled={rbPage >= totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-glass-border text-xs font-medium text-ink-soft hover:bg-accent/5 hover:border-accent/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
