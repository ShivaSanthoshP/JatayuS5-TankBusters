import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Search, Hash, ChevronRight, ChevronLeft,
  X, ExternalLink, Trash2, Plus, Sparkles, GraduationCap,
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import Loader from '../components/ui/Loader';
import { runbookDraft, RUNBOOKS_CHANGED_EVENT } from '../hooks/useRunbookDraft';
import { usePolling } from '../hooks/useApi';
import * as api from '../services/api';
import type { RunbookEntry } from '../types';
import { palette } from '../lib/theme';

type SeedFilter = 'all' | 'seeded' | 'auto';
type SortKey = 'newest' | 'title';

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

/* ── runbook row (click-to-navigate) ─────────────────────────── */
function RunbookRow({
  rb,
  onOpen,
}: {
  rb: RunbookEntry;
  onOpen: () => void;
}) {
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      type="button"
      onClick={onOpen}
      aria-label={`Open runbook: ${rb.title}`}
      id={`runbook-${rb.id}`}
      className="glass overflow-hidden w-full text-left
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40
        transition-colors"
    >
      <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 hover-row">
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
          <ChevronRight size={14} className="text-ink-faint" />
        </div>
      </div>
    </motion.button>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
export default function Runbooks() {
  const navigate = useNavigate();
  const { data: runbooks, loading, refetch } = usePolling<RunbookEntry[]>(api.getRunbooks, 15000);
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);

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
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [titleFilter, setTitleFilter] = useState('');

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
    if (sortKey === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title));
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

  // Search-result jump now navigates to the standalone detail page.
  const jumpToRunbook = useCallback((runbookId: number) => {
    navigate(`/runbooks/${runbookId}`);
  }, [navigate]);

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
              title="Seed a new canonical runbook"
            >
              <Plus size={13} /> Seed a runbook
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

      {/* ── Stats masthead ──────────────────────────────────────
          Anchors the page so the list below reads as a library of
          known fixes, not a generic dropdown. */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <RbStat
          icon={<BookOpen size={14} className="text-ink-mute" />}
          label="Total"
          value={counts.all}
          hint="known runbooks"
        />
        <RbStat
          icon={<Sparkles size={14} className="text-info" />}
          label="Seeded"
          value={counts.seeded}
          hint="canonical"
        />
        <RbStat
          icon={<GraduationCap size={14} className="text-success" />}
          label="Learned"
          value={counts.auto}
          hint="from incidents"
        />
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
              <option value="newest">Sort: Newest first</option>
              <option value="title">Sort: Title (A–Z)</option>
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
            <RunbookRow
              key={rb.id}
              rb={rb}
              onOpen={() => navigate(`/runbooks/${rb.id}`)}
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

/* ─── stat card for the masthead ─────────────────────────────── */
function RbStat({
  icon, label, value, hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-glass-border px-4 py-3 transition-colors">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-mute">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-display text-[22px] sm:text-[26px] leading-none text-ink tabular-nums">
        {value}
      </div>
      <div className="text-[11px] text-ink-faint mt-1">{hint}</div>
    </div>
  );
}
