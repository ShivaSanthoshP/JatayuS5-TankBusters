import {
  Activity, Brain, FileCheck, Shield, TrendingUp, Wrench, Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import ArtifactViewer from '../remediation/ArtifactViewer';
import StatusBadge from '../ui/StatusBadge';
import * as api from '../../services/api';
import type { Incident, RemediationDetail } from '../../types';

interface IncidentDetailBodyProps {
  incident: Incident;
  remediation: RemediationDetail | null | undefined;
  remediationLoading: boolean;
}

/**
 * Five-section pipeline view of one incident: Monitoring → Prediction →
 * Diagnosis → Remediation → Reporting, in the order the agents ran.
 * Each section uses a numbered mono prefix + display label + icon. The
 * Monitoring + Reporting sections are honest about the data the backend
 * currently persists (description, timestamps only); the others render
 * the full agent payload.
 */
export default function IncidentDetailBody({
  incident,
  remediation,
  remediationLoading,
}: IncidentDetailBodyProps) {
  const diagnostic = (incident.diagnostic_details || {}) as {
    causal_chain?: string[];
    blast_radius?: string[];
    reasons?: string[];
    issue_type?: string;
    confidence?: number;
    recommended_actions?: string[];
  };
  const prediction = (incident.prediction_details || {}) as {
    failure_probability?: number;
    escalation_risk?: string;
    recommended_urgency?: string;
    predicted_impact?: string;
    reasoning?: string;
    estimated_time_to_failure?: string;
  };

  return (
    <div className="space-y-14">
      {/* 01 — Monitoring */}
      <PipelineSection step="01" label="Monitoring" icon={Activity}>
        {incident.description ? (
          <p className="text-[13px] text-ink-mute leading-relaxed bg-canvas-soft rounded-lg px-4 py-3">
            {incident.description}
          </p>
        ) : (
          <Note>Monitoring narrative is not persisted for older incidents.</Note>
        )}
        <KeyValueRow>
          <KV label="Severity"><StatusBadge status={incident.severity} /></KV>
          <KV label="Anomaly type">{diagnostic.issue_type || '—'}</KV>
          <KV label="Detected">
            {incident.detected_at ? new Date(incident.detected_at).toLocaleString() : '—'}
          </KV>
        </KeyValueRow>
      </PipelineSection>

      {/* 02 — Prediction */}
      <PipelineSection step="02" label="Prediction" icon={TrendingUp}>
        {prediction.failure_probability !== undefined ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <PredictionStat
                value={`${(prediction.failure_probability * 100).toFixed(0)}%`}
                label="Failure prob."
              />
              <PredictionStat
                value={prediction.escalation_risk || '—'}
                label="Escalation"
              />
              <PredictionStat
                value={prediction.recommended_urgency || '—'}
                label="Urgency"
              />
            </div>
            {prediction.predicted_impact && (
              <Subblock label="Predicted impact">
                <p className="text-[13px] text-ink-mute leading-relaxed">
                  {prediction.predicted_impact}
                </p>
              </Subblock>
            )}
            {prediction.estimated_time_to_failure && (
              <Subblock label="Estimated time to failure">
                <p className="text-[13px] text-ink-mute leading-relaxed">
                  {prediction.estimated_time_to_failure}
                </p>
              </Subblock>
            )}
            {prediction.reasoning && (
              <Subblock label="Model reasoning">
                <p className="text-[12px] text-ink-faint leading-relaxed">
                  {prediction.reasoning}
                </p>
              </Subblock>
            )}
          </>
        ) : (
          <Note>The predictive agent produced no output for this incident.</Note>
        )}
      </PipelineSection>

      {/* 03 — Diagnosis */}
      <PipelineSection step="03" label="Diagnosis" icon={Brain}>
        {incident.root_cause && (
          <Subblock label="Root cause">
            <p className="text-[13px] text-ink-mute leading-relaxed bg-canvas-soft rounded-lg px-4 py-3">
              {incident.root_cause}
            </p>
          </Subblock>
        )}

        {diagnostic.reasons && diagnostic.reasons.length > 0 && (
          <Subblock label="Why this happened">
            <div className="space-y-1.5">
              {diagnostic.reasons.map((reason, i) => (
                <div
                  key={i}
                  className="text-[13px] text-ink-mute flex items-start gap-2 bg-canvas-soft rounded-lg px-3 py-2"
                >
                  <span className="w-1.5 h-1.5 mt-2 rounded-full bg-warning/70 shrink-0" />
                  <span className="leading-relaxed">{reason}</span>
                </div>
              ))}
            </div>
          </Subblock>
        )}

        {diagnostic.causal_chain && diagnostic.causal_chain.length > 0 && (
          <Subblock label="Causal chain">
            <ol className="space-y-1.5">
              {diagnostic.causal_chain.map((step, i) => (
                <li
                  key={i}
                  className="text-[13px] text-ink-mute flex items-start gap-2 leading-relaxed"
                >
                  <span className="text-[11px] font-mono text-ink-faint w-5 shrink-0 mt-0.5">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </Subblock>
        )}

        {diagnostic.blast_radius && diagnostic.blast_radius.length > 0 && (
          <Subblock label="Blast radius">
            <div className="flex flex-wrap gap-1.5">
              {diagnostic.blast_radius.map((s, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded bg-critical/10 text-critical text-xs"
                >
                  {s}
                </span>
              ))}
            </div>
          </Subblock>
        )}

        {diagnostic.recommended_actions && diagnostic.recommended_actions.length > 0 && (
          <Subblock label="Recommended actions">
            <ul className="space-y-1">
              {diagnostic.recommended_actions.map((action, i) => (
                <li key={i} className="text-[13px] text-ink-mute flex items-start gap-2 leading-relaxed">
                  <Shield size={12} className="text-info shrink-0 mt-1" />
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </Subblock>
        )}
      </PipelineSection>

      {/* 04 — Remediation */}
      <PipelineSection step="04" label="Remediation" icon={Wrench}>
        {remediationLoading && (
          <div className="flex items-center gap-2 text-xs text-ink-faint">
            <Loader2 size={12} className="animate-spin" />
            Loading remediation…
          </div>
        )}

        {!remediationLoading && remediation && (
          <>
            {remediation.plan_summary && (
              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-canvas-soft rounded-lg p-3">
                  <div className="text-ink-faint mb-1">Plan summary</div>
                  <div className="text-ink-soft leading-relaxed">
                    {remediation.plan_summary}
                  </div>
                </div>
                <div className="bg-canvas-soft rounded-lg p-3">
                  <div className="text-ink-faint mb-1">Delivery strategy</div>
                  <div className="text-ink-soft capitalize">
                    {remediation.strategy || 'shell'}
                  </div>
                </div>
              </div>
            )}

            {((remediation.steps as Array<Record<string, unknown>>) || []).length > 0 && (
              <Subblock label="Simple fix steps">
                <div className="space-y-2">
                  {((remediation.steps as Array<Record<string, unknown>>) || []).map((step, index) => {
                    const action = String(step['action'] || `Step ${index + 1}`);
                    const description = String(step['description'] || '');
                    return (
                      <div
                        key={index}
                        className="rounded-lg bg-warning/8 border border-warning/20 px-3 py-2"
                      >
                        <div className="text-xs font-medium text-ink-soft">
                          {index + 1}. {action}
                        </div>
                        {description && (
                          <div className="text-xs text-ink-mute mt-1 leading-relaxed">
                            {description}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Subblock>
            )}

            <Subblock label="Generated files">
              <ArtifactViewer
                artifacts={remediation.artifacts || []}
                title=""
                emptyLabel="This incident has a remediation record, but no downloadable scripts were generated."
                downloadUrlBuilder={(artifact) =>
                  api.getIncidentRemediationArtifactDownloadUrl(incident.id, artifact.id)
                }
              />
            </Subblock>
          </>
        )}

        {!remediationLoading && remediation === null && (
          <Note>No remediation record was produced for this incident.</Note>
        )}
      </PipelineSection>

      {/* 05 — Reporting */}
      <PipelineSection step="05" label="Reporting" icon={FileCheck}>
        <KeyValueRow>
          <KV label="Status"><StatusBadge status={incident.status} /></KV>
          <KV label="Resolved">
            {incident.resolved_at ? new Date(incident.resolved_at).toLocaleString() : '—'}
          </KV>
          <KV label="Filed">
            {incident.created_at ? new Date(incident.created_at).toLocaleString() : '—'}
          </KV>
        </KeyValueRow>
        <Note>
          The reporting agent's full output (executive summary, runbook title,
          MTTR estimate, SLA impact, timeline) is generated at pipeline runtime
          but isn't persisted to the incident record yet. Add a
          <code className="font-mono text-[12px] mx-1 px-1 rounded bg-canvas-soft">reporting_details</code>
          JSON column to enable it here.
        </Note>
      </PipelineSection>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */

function PipelineSection({
  step,
  label,
  icon: Icon,
  children,
}: {
  step: string;
  label: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-4">
        <span className="font-mono text-[11px] text-ink-faint tabular-nums tracking-wide">
          {step}
        </span>
        <span className="text-ink-faint/60">/</span>
        <h2 className="font-display text-[17px] sm:text-[19px] leading-none text-ink">
          {label}
        </h2>
        <Icon size={15} className="text-ink-mute ml-1" />
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Subblock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[12px] font-semibold text-ink-soft mb-1.5">{label}</h3>
      {children}
    </div>
  );
}

function KeyValueRow({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
      {children}
    </dl>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-canvas-soft rounded-lg px-3 py-2">
      <dt className="text-ink-faint mb-1">{label}</dt>
      <dd className="text-ink-soft flex items-center gap-1.5 flex-wrap">{children}</dd>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] text-ink-faint leading-relaxed italic">{children}</p>
  );
}

function PredictionStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-canvas-soft rounded-lg p-3 text-center">
      <div className="text-lg font-bold text-ink leading-tight">{value}</div>
      <div className="text-ink-faint mt-1">{label}</div>
    </div>
  );
}
