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
    if (!validId) {
      setIncident(null);
      return;
    }
    let cancelled = false;
    setIncident(undefined);
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
      className="max-w-[920px] mx-auto"
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
        <>
          {/* Title block. Title gets its own line at display weight; meta
              sits below as one quiet horizontal row. */}
          <header className="mt-6 pb-6 border-b border-glass-border">
            <h1 className="font-display text-[28px] sm:text-[34px] lg:text-[38px] leading-tight text-ink">
              {incident.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-[12px] sm:text-[13px] text-ink-faint">
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

          {/* Detail body — same component the (now-retired) drawer used. */}
          <div className="pt-8 pb-16">
            <IncidentDetailBody
              incident={incident}
              remediation={remediation}
              remediationLoading={remediationLoading}
            />
          </div>
        </>
      )}
    </motion.div>
  );
}

function Dot() {
  return <span className="text-ink-faint/50">·</span>;
}
