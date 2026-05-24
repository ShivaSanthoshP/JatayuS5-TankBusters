import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ChevronLeft, ChevronRight, ChevronRight as RowChevron,
  Activity, CheckCircle2, Flame,
} from 'lucide-react';
import StatusBadge from '../components/ui/StatusBadge';
import { usePolling } from '../hooks/useApi';
import * as api from '../services/api';
import type { Incident } from '../types';

const RESOLVED_STATES = new Set(['resolved', 'closed', 'completed']);

export default function Incidents() {
  const navigate = useNavigate();
  const { data: incidents } = usePolling<Incident[]>(
    () => api.getIncidents(),
    8000,
    [],
  );
  const incidentList = incidents || [];

  // ── Summary stats ────────────────────────────────────────
  const stats = useMemo(() => {
    let open = 0, resolved = 0, critical = 0;
    let mostRecentOpen: Incident | null = null;
    for (const inc of incidentList) {
      const isResolved = RESOLVED_STATES.has((inc.status || '').toLowerCase());
      if (isResolved) {
        resolved += 1;
      } else {
        open += 1;
        const ts = inc.detected_at ? new Date(inc.detected_at).getTime() : 0;
        const prevTs = mostRecentOpen?.detected_at
          ? new Date(mostRecentOpen.detected_at).getTime()
          : 0;
        if (!mostRecentOpen || ts > prevTs) mostRecentOpen = inc;
      }
      if (inc.severity === 'critical') critical += 1;
    }
    return { total: incidentList.length, open, resolved, critical, mostRecentOpen };
  }, [incidentList]);

  // ── Group: open above, resolved below — keeps the eye on what matters
  const { openRows, resolvedRows } = useMemo(() => {
    const o: Incident[] = [];
    const r: Incident[] = [];
    for (const inc of incidentList) {
      if (RESOLVED_STATES.has((inc.status || '').toLowerCase())) r.push(inc);
      else o.push(inc);
    }
    // Open: criticals first, then by recency
    o.sort((a, b) => {
      if (a.severity === 'critical' && b.severity !== 'critical') return -1;
      if (b.severity === 'critical' && a.severity !== 'critical') return 1;
      const ta = a.detected_at ? new Date(a.detected_at).getTime() : 0;
      const tb = b.detected_at ? new Date(b.detected_at).getTime() : 0;
      return tb - ta;
    });
    // Resolved: most-recently-resolved first
    r.sort((a, b) => {
      const ta = a.resolved_at ? new Date(a.resolved_at).getTime() : 0;
      const tb = b.resolved_at ? new Date(b.resolved_at).getTime() : 0;
      return tb - ta;
    });
    return { openRows: o, resolvedRows: r };
  }, [incidentList]);

  const orderedList = useMemo(
    () => [...openRows, ...resolvedRows],
    [openRows, resolvedRows],
  );

  // ── Pagination ───────────────────────────────────────────
  const PAGE_SIZE = 50;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(orderedList.length / PAGE_SIZE));
  const paginatedIncidents = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return orderedList.slice(start, start + PAGE_SIZE);
  }, [orderedList, currentPage]);

  useMemo(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalPages, currentPage]);

  // Find the split point within the visible page so we can drop a section
  // header between the last open row and the first resolved row.
  const splitIdx = paginatedIncidents.findIndex((inc) =>
    RESOLVED_STATES.has((inc.status || '').toLowerCase())
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="font-display text-[24px] sm:text-[28px] leading-tight text-[var(--color-ink)]">
          Incidents
        </h1>
        <p className="text-xs sm:text-sm text-ink-mute mt-1">
          Detected anomalies, diagnostics, and remediation tracking
        </p>
      </div>

      {/* ── Stats masthead ─────────────────────────────────────
          Anchors the page so the list below reads as a list of THINGS,
          not a generic dropdown. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Activity size={14} className="text-ink-mute" />}
          label="Total"
          value={stats.total}
          hint="all-time"
        />
        <StatCard
          icon={<AlertTriangle size={14} className="text-warning" />}
          label="Open"
          value={stats.open}
          hint={stats.open === 0 ? 'nothing pending' : 'awaiting resolution'}
          accent={stats.open > 0 ? 'warning' : undefined}
        />
        <StatCard
          icon={<Flame size={14} className="text-critical" />}
          label="Critical"
          value={stats.critical}
          hint={stats.critical === 0 ? 'no critical' : 'critical severity'}
          accent={stats.critical > 0 ? 'critical' : undefined}
        />
        <StatCard
          icon={<CheckCircle2 size={14} className="text-success" />}
          label="Resolved"
          value={stats.resolved}
          hint="closed"
        />
      </div>

      {/* ── Incident list ─────────────────────────────────────── */}
      <div className="space-y-3">
        {openRows.length > 0 && (
          <SectionDivider label={`Open · ${openRows.length}`} tone="warning" />
        )}

        <AnimatePresence>
          {paginatedIncidents.map((inc, i) => {
            const isResolved = RESOLVED_STATES.has((inc.status || '').toLowerCase());
            const isCritical = inc.severity === 'critical';
            const showResolvedHeader = i === splitIdx && splitIdx !== 0;
            return (
              <div key={inc.id}>
                {showResolvedHeader && (
                  <SectionDivider
                    label={`Resolved · ${resolvedRows.length}`}
                    tone="success"
                  />
                )}
                <motion.button
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  type="button"
                  onClick={() => navigate(`/incidents/${inc.id}`)}
                  aria-label={`Open incident ${inc.id}: ${inc.title}`}
                  className={`glass overflow-hidden transition-colors w-full text-left relative
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40
                    ${isCritical ? 'border-critical/25 glow-red' : ''}
                    ${isResolved ? 'opacity-90' : ''}`}
                >
                  {/* Severity rail — only on critical, draws the eye */}
                  {isCritical && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-critical/80"
                    />
                  )}

                  <div className="flex items-center gap-2 sm:gap-4 p-3 sm:p-4 hover-row">
                    <span className="text-xs sm:text-sm font-mono text-ink-faint w-8 sm:w-12 shrink-0 tabular-nums">
                      #{inc.id}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${isCritical ? 'text-ink font-medium' : 'text-ink'}`}>
                        {inc.title}
                      </p>
                      <p className="text-[11px] sm:text-xs text-ink-faint mt-0.5 truncate">
                        {inc.node_name}
                        {inc.detected_at && (
                          <>
                            <span className="mx-1.5 text-ink-faint/60">·</span>
                            <span title={new Date(inc.detected_at).toLocaleString()}>
                              {relativeTime(inc.detected_at)}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 shrink-0">
                      <StatusBadge status={inc.severity} />
                      <StatusBadge status={inc.status} />
                    </div>
                    <div className="flex sm:hidden shrink-0">
                      <StatusBadge status={inc.severity} />
                    </div>
                    <RowChevron size={16} className="text-ink-faint shrink-0" />
                  </div>
                </motion.button>
              </div>
            );
          })}
        </AnimatePresence>

        {incidentList.length === 0 && (
          <div className="text-center py-16 text-ink-faint">
            <AlertTriangle size={32} className="mx-auto mb-3 opacity-30" />
            <p>No incidents found</p>
          </div>
        )}

        {/* ── Pagination controls ─────────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 flex-wrap gap-3">
            <p className="text-xs text-ink-faint">
              Showing{' '}
              <b className="text-ink-soft">
                {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, orderedList.length)}
              </b>{' '}
              of <b className="text-ink-soft">{orderedList.length}</b> incidents
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-glass-border text-xs font-medium text-ink-soft hover:bg-accent/5 hover:border-accent/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} />
                Previous
              </button>
              <span className="text-xs text-ink-mute font-medium px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-glass-border text-xs font-medium text-ink-soft hover:bg-accent/5 hover:border-accent/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ─── stat card ─────────────────────────────────────────────── */

function StatCard({
  icon, label, value, hint, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
  accent?: 'warning' | 'critical';
}) {
  const accentRing =
    accent === 'critical' ? 'border-critical/30 bg-critical/[0.03]' :
    accent === 'warning'  ? 'border-warning/30 bg-warning/[0.03]'   :
    'border-glass-border';
  return (
    <div className={`rounded-xl border ${accentRing} px-4 py-3 transition-colors`}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-mute">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-display text-[26px] sm:text-[28px] leading-none text-ink tabular-nums">
        {value}
      </div>
      <div className="text-[11px] text-ink-faint mt-1">{hint}</div>
    </div>
  );
}

/* ─── section divider ──────────────────────────────────────── */

function SectionDivider({ label, tone }: { label: string; tone: 'warning' | 'success' }) {
  const dotColor = tone === 'warning' ? 'bg-warning/70' : 'bg-success/70';
  return (
    <div className="flex items-center gap-2 px-1 pt-2 pb-1 select-none">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span className="text-[11px] font-medium text-ink-mute tracking-wide">
        {label}
      </span>
      <span className="flex-1 h-px bg-glass-border/70" />
    </div>
  );
}

/* ─── relative time ────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / (86400 * 7))}w ago`;
  return new Date(iso).toLocaleDateString();
}
