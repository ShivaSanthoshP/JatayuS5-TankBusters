import { Brain, Shield, Wrench, Loader2 } from 'lucide-react';
import ArtifactViewer from '../remediation/ArtifactViewer';
import * as api from '../../services/api';
import type { Incident, RemediationDetail } from '../../types';

interface IncidentDetailBodyProps {
  incident: Incident;
  remediation: RemediationDetail | null | undefined;
  remediationLoading: boolean;
}

/**
 * Pure detail layout for one incident: root cause, diagnostics, prediction,
 * remediation. Container-agnostic — used inside the slide-over drawer today,
 * mountable inside a /incidents/:id page later without changes.
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
  };
  const prediction = (incident.prediction_details || {}) as {
    failure_probability?: number;
    escalation_risk?: string;
    recommended_urgency?: string;
  };
  const remediationSteps = (remediation?.steps || []) as Array<Record<string, unknown>>;

  return (
    <div className="space-y-7">
      {incident.root_cause && (
        <section>
          <SectionHead icon={<Brain size={14} className="text-accent" />} label="Root Cause" />
          <p className="text-[13px] text-ink-mute leading-relaxed bg-canvas-soft rounded-lg px-4 py-3">
            {incident.root_cause}
          </p>
        </section>
      )}

      {diagnostic.reasons && diagnostic.reasons.length > 0 && (
        <section>
          <SectionHead label="Why This Happened" />
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
        </section>
      )}

      {diagnostic.causal_chain && diagnostic.causal_chain.length > 0 && (
        <section>
          <SectionHead label="Causal Chain" />
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
        </section>
      )}

      {diagnostic.blast_radius && diagnostic.blast_radius.length > 0 && (
        <section>
          <SectionHead label="Blast Radius" />
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
        </section>
      )}

      {prediction.failure_probability !== undefined && (
        <section>
          <SectionHead icon={<Shield size={14} className="text-info" />} label="Prediction" />
          <div className="grid grid-cols-3 gap-2 text-xs">
            <PredictionStat
              value={`${(prediction.failure_probability * 100).toFixed(0)}%`}
              label="Failure Prob."
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
        </section>
      )}

      <section>
        <SectionHead icon={<Wrench size={14} className="text-warning" />} label="Remediation" />

        {remediationLoading && (
          <div className="flex items-center gap-2 text-xs text-ink-faint">
            <Loader2 size={12} className="animate-spin" />
            Loading remediation scripts…
          </div>
        )}

        {!remediationLoading && remediation && (
          <div className="space-y-3">
            {remediation.plan_summary && (
              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-canvas-soft rounded-lg p-3">
                  <div className="text-ink-faint mb-1">Plan Summary</div>
                  <div className="text-ink-soft leading-relaxed">
                    {remediation.plan_summary}
                  </div>
                </div>
                <div className="bg-canvas-soft rounded-lg p-3">
                  <div className="text-ink-faint mb-1">Delivery Strategy</div>
                  <div className="text-ink-soft capitalize">
                    {remediation.strategy || 'shell'}
                  </div>
                </div>
              </div>
            )}

            {remediationSteps.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-ink-soft mb-2">Simple Fix Steps</div>
                <div className="space-y-2">
                  {remediationSteps.map((step, index) => {
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
              </div>
            )}

            <ArtifactViewer
              artifacts={remediation.artifacts || []}
              title="Generated Remediation Files"
              emptyLabel="This incident has a remediation record, but no downloadable scripts were generated."
              downloadUrlBuilder={(artifact) =>
                api.getIncidentRemediationArtifactDownloadUrl(incident.id, artifact.id)
              }
            />
          </div>
        )}

        {!remediationLoading && remediation === null && (
          <p className="text-xs text-ink-faint">
            No remediation record yet for this incident.
          </p>
        )}
      </section>
    </div>
  );
}

function SectionHead({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      {icon}
      <h3 className="text-[13px] font-semibold text-ink-soft">{label}</h3>
    </div>
  );
}

function PredictionStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-canvas-soft rounded-lg p-2 text-center">
      <div className="text-lg font-bold text-ink">{value}</div>
      <div className="text-ink-faint">{label}</div>
    </div>
  );
}
