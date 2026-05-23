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
 * Slide-over drawer for one incident, Linear/Stripe pattern: opens from
 * the right, the list stays visible and clickable behind it (no heavy
 * backdrop on desktop), so SREs can swap incidents without closing.
 * Full-screen on mobile with a light backdrop for tap-out.
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

  // Focus the close button on open + restore focus on close. The page
  // scroll is *not* locked — the list behind the drawer should stay
  // scrollable so the user can browse and swap. The drawer body itself
  // carries overscroll-contain so its own scroll doesn't chain out.
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 60);
    return () => {
      window.clearTimeout(t);
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && incident && (
        <>
          {/* Mobile-only backdrop — drawer is full-screen on mobile so
              the dimmed area is the tap-to-close target. On sm+ there's
              no backdrop; the list stays bright and interactive. */}
          <motion.div
            key="incident-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            onClick={onClose}
            className="sm:hidden fixed inset-0 z-[60]
              bg-[rgba(21,25,26,0.32)] backdrop-blur-[2px]"
            aria-hidden
          />

          {/* Panel */}
          <motion.div
            key="incident-drawer-panel"
            role="dialog"
            aria-modal={false}
            aria-labelledby={titleId}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            className="fixed right-0 bottom-0 z-[61]
              top-0 sm:top-[88px]
              w-full sm:w-[520px] md:w-[580px] lg:w-[620px]
              bg-[var(--color-surface)] border-l border-glass-border
              shadow-[-24px_0_60px_-20px_rgba(21,25,26,0.18)]
              sm:rounded-tl-2xl
              overflow-hidden
              flex flex-col"
          >
            {/* Close button — its own row, top-right. Keeps the title
                row free of competing controls. */}
            <div className="shrink-0 flex justify-end px-3 pt-3">
              <button
                ref={closeBtnRef}
                type="button"
                onClick={onClose}
                aria-label="Close incident detail"
                className="inline-flex items-center justify-center
                  w-9 h-9 rounded-full text-ink-mute
                  hover:text-ink hover:bg-canvas-soft
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40
                  transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Header — title gets the full line, badges + meta sit in
                a quiet row below. */}
            <header className="shrink-0 px-5 sm:px-7 pb-5 border-b border-glass-border">
              <h2
                id={titleId}
                className="font-display text-[22px] sm:text-[24px] leading-tight text-ink"
              >
                {incident.title}
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] sm:text-xs text-ink-faint">
                <span className="font-mono text-ink-mute">#{incident.id}</span>
                <span className="text-ink-faint/60">·</span>
                <StatusBadge status={incident.severity} />
                <StatusBadge status={incident.status} />
                <span className="text-ink-faint/60">·</span>
                <span>{incident.node_name}</span>
                {incident.detected_at && (
                  <>
                    <span className="text-ink-faint/60">·</span>
                    <span>{new Date(incident.detected_at).toLocaleString()}</span>
                  </>
                )}
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
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-7 pt-6 pb-10">
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
