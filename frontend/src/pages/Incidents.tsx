import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, ChevronRight as RowChevron } from 'lucide-react';
import StatusBadge from '../components/ui/StatusBadge';
import IncidentDrawer from '../components/incidents/IncidentDrawer';
import { usePolling } from '../hooks/useApi';
import * as api from '../services/api';
import type { Incident } from '../types';

export default function Incidents() {
  const { data: incidents } = usePolling<Incident[]>(
    () => api.getIncidents(),
    8000,
    [],
  );
  const incidentList = incidents || [];

  // Drawer state lives in the URL so browser-back closes it and a single
  // open incident is shareable inside the running session.
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = (() => {
    const raw = searchParams.get('incident');
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  })();
  const openIncident = openId !== null
    ? incidentList.find((inc) => inc.id === openId) ?? null
    : null;

  const openDrawer = (id: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('incident', String(id));
      return next;
    });
  };
  const closeDrawer = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('incident');
      return next;
    });
  };

  // ── Pagination ───────────────────────────────────────────
  const PAGE_SIZE = 50;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(incidentList.length / PAGE_SIZE));
  const paginatedIncidents = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return incidentList.slice(start, start + PAGE_SIZE);
  }, [incidentList, currentPage]);

  useMemo(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalPages, currentPage]);

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

      {/* ── Incident list ─────────────────────────────────────── */}
      <div className="space-y-3">
        <AnimatePresence>
          {paginatedIncidents.map((inc) => (
            <motion.button
              key={inc.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              type="button"
              onClick={() => openDrawer(inc.id)}
              aria-label={`Open incident ${inc.id}: ${inc.title}`}
              className={`glass overflow-hidden transition-colors w-full text-left
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40
                ${inc.severity === 'critical' ? 'border-critical/25 glow-red' : ''}`}
            >
              <div className="flex items-center gap-2 sm:gap-4 p-3 sm:p-4 hover-row">
                <span className="text-xs sm:text-sm font-mono text-ink-faint w-8 sm:w-12 shrink-0">
                  #{inc.id}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink truncate">{inc.title}</p>
                  <p className="text-[11px] sm:text-xs text-ink-faint mt-0.5 truncate">
                    {inc.node_name}
                    {inc.detected_at && (
                      <>
                        {' · '}
                        {new Date(inc.detected_at).toLocaleString()}
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
          ))}
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
                {Math.min(currentPage * PAGE_SIZE, incidentList.length)}
              </b>{' '}
              of <b className="text-ink-soft">{incidentList.length}</b> incidents
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

      <IncidentDrawer incident={openIncident} onClose={closeDrawer} />
    </motion.div>
  );
}
