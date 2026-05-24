import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, AlertTriangle, Loader2 } from 'lucide-react';
import StatusBadge from '../components/ui/StatusBadge';
import IncidentDetailBody from '../components/incidents/IncidentDetailBody';
import * as api from '../services/api';
import type { Incident, RemediationDetail } from '../types';

/**
 * Full-page incident view. Long-Document macrostructure: back link, big
 * display title, quiet meta row, then the detail sections flowing in a
 * single comfortable read column. Owns its own data lifecycle — fetches
 * the incident by route id, then the remediation for that incident.
 */
export default function IncidentDetail() {
  const { id: idParam } = useParams<{ id: string }>();
  const idNum = Number(idParam);
  const validId = Number.isFinite(idNum) && idNum > 0;

  const [incident, setIncident] = useState<Incident | null | undefined>(undefined);
  const [remediation, setRemediation] = useState<RemediationDetail | null | undefined>(undefined);
  const [remediationLoading, setRemediationLoading] = useState(false);

  useEffect(() => {
    // Reset the incident state on every id change — the warning here is
    // about cascading renders, but this is the intentional "show loading
    // sentinel while the new fetch resolves" pattern, and the resets are
    // guarded by the id check or terminate the effect.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!validId) {
      setIncident(null);
      return;
    }
    let cancelled = false;
    setIncident(undefined);
    /* eslint-enable react-hooks/set-state-in-effect */
    api
      .getIncident(idNum)
      .then((inc) => {
        if (!cancelled) setIncident(inc ?? null);
      })
      .catch(() => {
        if (!cancelled) setIncident(null);
      });
    return () => {
      cancelled = true;
    };
  }, [idNum, validId]);

  useEffect(() => {
    if (!validId) return;
    let cancelled = false;
    // Same reset-before-fetch intent as the incident effect above —
    // clearing the previous payload while the new one loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRemediation(undefined);
    setRemediationLoading(true);
    api
      .getIncidentRemediation(idNum)
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
  }, [idNum, validId]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      className="max-w-[920px] xl:max-w-[1320px] mx-auto"
    >
      {/* Back link — small, quiet, top-left. No breadcrumb cliché. */}
      <Link
        to="/incidents"
        className="inline-flex items-center gap-1.5 text-[12px] text-ink-mute
          hover:text-ink transition-colors
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40
          rounded"
      >
        <ArrowLeft size={13} />
        All incidents
      </Link>

      {incident === undefined && (
        <div className="mt-12 flex items-center gap-2 text-sm text-ink-mute">
          <Loader2 size={14} className="animate-spin" />
          Loading incident…
        </div>
      )}

      {incident === null && (
        <div className="mt-16 max-w-md">
          <div className="flex items-center gap-2 text-warning mb-2">
            <AlertTriangle size={18} />
            <h1 className="font-display text-[20px] text-ink">Incident not found</h1>
          </div>
          <p className="text-sm text-ink-mute">
            No incident exists at this id, or the backend couldn't return one.
          </p>
        </div>
      )}

      {incident && (
        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-12 xl:items-start">
          <main className="min-w-0">
            {/* Title block. Title gets its own line at display weight;
                inline meta below on <xl, hidden on xl+ where the sidebar
                takes over. */}
            <header className="mt-6 pb-6 border-b border-glass-border">
              <h1 className="font-display text-[28px] sm:text-[34px] lg:text-[38px] leading-tight text-ink">
                {incident.title}
              </h1>
              <div className="xl:hidden mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-[12px] sm:text-[13px] text-ink-faint">
                <span className="font-mono text-ink-mute">#{incident.id}</span>
                <Dot />
                <StatusBadge status={incident.severity} />
                <StatusBadge status={incident.status} />
                <Dot />
                <span>{incident.node_name}</span>
                {incident.detected_at && (
                  <>
                    <Dot />
                    <span>Detected {new Date(incident.detected_at).toLocaleString()}</span>
                  </>
                )}
                {incident.resolved_at && (
                  <>
                    <Dot />
                    <span>Resolved {new Date(incident.resolved_at).toLocaleString()}</span>
                  </>
                )}
              </div>
            </header>

            <div className="pt-8 pb-16">
              <IncidentDetailBody
                incident={incident}
                remediation={remediation}
                remediationLoading={remediationLoading}
              />
            </div>
          </main>

          {/* Sidebar — appears only on xl+. Carries the meta that's
              inline at smaller breakpoints, plus the run timestamps. */}
          <aside className="hidden xl:block xl:sticky xl:top-[120px] xl:self-start xl:mt-6">
            <div className="glass-mica rounded-2xl p-5 space-y-5">
              <div>
                <div className="font-mono text-[11px] text-ink-faint tabular-nums">
                  Incident #{incident.id}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusBadge status={incident.severity} />
                  <StatusBadge status={incident.status} />
                </div>
              </div>

              <Divider />

              <Field label="Node">{incident.node_name || '—'}</Field>
              <Field label="Detected">
                {incident.detected_at ? new Date(incident.detected_at).toLocaleString() : '—'}
              </Field>
              <Field label="Resolved">
                {incident.resolved_at ? new Date(incident.resolved_at).toLocaleString() : '—'}
              </Field>
              <Field label="Filed">
                {incident.created_at ? new Date(incident.created_at).toLocaleString() : '—'}
              </Field>
            </div>
          </aside>
        </div>
      )}
    </motion.div>
  );
}

function Dot() {
  return <span className="text-ink-faint/50">·</span>;
}

function Divider() {
  return <div className="h-px bg-glass-border" />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-ink-faint font-medium">{label}</div>
      <div className="mt-1 text-[13px] text-ink-soft leading-snug">{children}</div>
    </div>
  );
}
