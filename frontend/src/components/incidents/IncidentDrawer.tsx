import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ChevronLeft } from 'lucide-react';
import StatusBadge from '../ui/StatusBadge';
import IncidentDetailBody from './IncidentDetailBody';
import * as api from '../../services/api';
import type { Incident, RemediationDetail } from '../../types';

interface IncidentDrawerProps {
  incident: Incident | null;
  onClose: () => void;
}

/**
 * Slide-over drawer for one incident. Opens from the right on desktop and
 * fills the screen on mobile. Owns the remediation fetch for the open
 * incident; the parent page only hands in the incident object + close
 * callback. Esc and backdrop click both close.
 */
export default function IncidentDrawer({ incident, onClose }: IncidentDrawerProps) {
  const isOpen = incident !== null;
  const titleId = 'incident-drawer-title';
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const [remediation, setRemediation] = useState<RemediationDetail | null | undefined>(undefined);
  const [remediationLoading, setRemediationLoading] = useState(false);

  // Fetch remediation whenever the drawer opens for a (different) incident.
  // Keyed on id so the parent's 8s poll doesn't trigger a refetch.
  const incidentId = incident?.id ?? null;
  useEffect(() => {
    if (incidentId === null) {
      setRemediation(undefined);
      setRemediationLoading(false);
      return;
    }
    let cancelled = false;
    setRemediation(undefined);
    setRemediationLoading(true);
    api
      .getIncidentRemediation(incidentId)
      .then((r) => {
        if (!cancelled) setRemediation(r);
      })
      .catch(() => {
        if (!cancelled) setRemediation(null);
      })
      .finally(() => {
        if (!cancelled) setRemediationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [incidentId]);

  // Esc to close.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Lock page scroll while open + capture/restore focus. The actual scroll
  // container in this app is <main> (overflow-y-auto in Layout.tsx), not
  // <body> — so locking body alone leaves the page scrollable behind the
  // drawer. Lock both to be safe.
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const main = document.querySelector('main') as HTMLElement | null;
    const prevBodyOverflow = document.body.style.overflow;
    const prevMainOverflow = main?.style.overflow ?? '';
    document.body.style.overflow = 'hidden';
    if (main) main.style.overflow = 'hidden';
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 60);
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      if (main) main.style.overflow = prevMainOverflow;
      window.clearTimeout(t);
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && incident && (
        <>
          {/* Backdrop — starts below the navbar on desktop so the nav
              stays visible and usable; full-overlay on mobile. */}
          <motion.div
            key="incident-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            onClick={onClose}
            className="fixed left-0 right-0 bottom-0 z-[60]
              top-0 sm:top-[88px]
              bg-[rgba(21,25,26,0.28)] backdrop-blur-[2px]"
            aria-hidden
          />

          {/* Panel — flush to the right edge, starts below the navbar on
              desktop with a rounded top-left so it reads as a panel, not
              a takeover. */}
          <motion.div
            key="incident-drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            className="fixed right-0 bottom-0 z-[61]
              top-0 sm:top-[88px]
              w-full sm:w-[520px] md:w-[600px] lg:w-[640px]
              bg-[var(--color-surface)] border-l border-glass-border
              shadow-[-24px_0_60px_-20px_rgba(21,25,26,0.22)]
              sm:rounded-tl-2xl
              overflow-hidden
              flex flex-col"
          >
            {/* Header */}
            <header
              className="shrink-0 px-5 sm:px-6 pt-5 pb-4
                border-b border-glass-border
                bg-[var(--color-surface)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px] font-mono text-ink-faint">
                      #{incident.id}
                    </span>
                    <StatusBadge status={incident.severity} />
                    <StatusBadge status={incident.status} />
                  </div>
                  <h2
                    id={titleId}
                    className="font-display text-[17px] sm:text-[19px] text-ink leading-snug"
                  >
                    {incident.title}
                  </h2>
                  <p className="text-[11px] sm:text-xs text-ink-faint mt-1.5">
                    {incident.node_name}
                    {incident.detected_at && (
                      <>
                        <span className="mx-1.5">·</span>
                        {new Date(incident.detected_at).toLocaleString()}
                      </>
                    )}
                  </p>
                </div>

                <button
                  ref={closeBtnRef}
                  type="button"
                  onClick={onClose}
                  aria-label="Close incident detail"
                  className="shrink-0 -mr-1 -mt-1 inline-flex items-center justify-center
                    w-9 h-9 rounded-full text-ink-mute
                    hover:text-ink hover:bg-canvas-soft
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40
                    transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </header>

            {/* Mobile back-pill — visible only when the drawer is full-width */}
            <button
              type="button"
              onClick={onClose}
              className="sm:hidden mx-5 mt-3 self-start inline-flex items-center gap-1.5
                text-[11px] text-ink-mute hover:text-ink"
            >
              <ChevronLeft size={13} />
              Back to incidents
            </button>

            {/* Scrollable body — overscroll-contain stops the scroll
                chain from continuing into the page below. */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 pt-5 pb-10">
              <IncidentDetailBody
                incident={incident}
                remediation={remediation}
                remediationLoading={remediationLoading}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
