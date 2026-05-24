import {
  Activity, Brain, FileCheck, Shield, TrendingUp, Wrench, Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import ArtifactViewer from '../remediation/ArtifactViewer';
import StatusBadge from '../ui/StatusBadge';
import type {
  RemediationArtifact, RemediationDetail, RemediationPlan,
} from '../../types';

type Dict = Record<string, unknown>;

type RemediationLike =
  | RemediationDetail
  | (RemediationPlan & { artifacts?: RemediationArtifact[] });

export interface PipelineResultViewMeta {
  status?: string;
  severity?: string;
  detected_at?: string | null;
  resolved_at?: string | null;
  created_at?: string | null;
  incident_id?: number | null;
}

export interface PipelineResultViewProps {
  monitoring?: Dict | null;
  prediction?: Dict | null;
  diagnostic?: Dict | null;
  remediation?: RemediationLike | null | undefined;
  remediationLoading?: boolean;
  reporting?: Dict | null;
  meta?: PipelineResultViewMeta;
  /** Builder for artifact download URLs. Only the persisted-incident path
   *  has a per-artifact endpoint; pipeline results omit this and the
   *  viewer falls back to inline-content download. */
  artifactDownloadUrl?: (artifact: RemediationArtifact) => string;
  /** Note appended to the Reporting section. Use it to call out backend
   *  gaps (e.g. "reporting_details not persisted on incident records"). */
  reportingNote?: React.ReactNode;
}

/**
 * Five-section pipeline view — Monitoring → Prediction → Diagnosis →
 * Remediation → Reporting — in the order the agents ran. Shared between
 * the incident detail page and the Run Pipeline results phase so both
 * surfaces read identically.
 */
export default function PipelineResultView({
  monitoring,
  prediction,
  diagnostic,
  remediation,
  remediationLoading = false,
  reporting,
  meta = {},
  artifactDownloadUrl,
  reportingNote,
}: PipelineResultViewProps) {
  const mon = (monitoring || {}) as Dict;
  const pred = (prediction || {}) as Dict;
  const diag = (diagnostic || {}) as Dict;
  const rep = (reporting || {}) as Dict;
  const rem = remediation || null;

  const anomalyType = pickStr(mon, 'anomaly_type') || pickStr(diag, 'issue_type');
  const severity = meta.severity || pickStr(mon, 'severity');
  const affectedMetrics = pickStringArray(mon, 'affected_metrics');
  const logEvidence = pickStr(mon, 'log_evidence');

  const reasons = pickStringishArray(diag, 'reasons');
  const causalChain = pickStringishArray(diag, 'causal_chain');
  const blastRadius = pickStringishArray(diag, 'blast_radius');
  const rootCause = pickStr(diag, 'root_cause');
  const recommendedActions = (diag.recommended_actions as unknown[] | undefined) ?? [];

  const remSteps = ((rem as Dict | null)?.['steps'] as Array<Dict> | undefined) ?? [];
  const remArtifacts = ((rem as Dict | null)?.['artifacts'] as RemediationArtifact[] | undefined) ?? [];
  const planSummary = rem ? pickStr(rem as Dict, 'plan_summary') : '';
  const strategy = rem ? pickStr(rem as Dict, 'strategy') : '';

  const executiveSummary = pickStr(rep, 'executive_summary');
  const runbookTitle = pickStr(rep, 'runbook_title');
  const mttr = pickNum(rep, 'mttr_estimate_minutes');
  const slaImpact = pickStr(rep, 'sla_impact');
  const timeline = (rep['timeline'] as Array<Dict> | undefined) ?? [];

  return (
    <div className="space-y-14">
      {/* 01 — Monitoring */}
      <PipelineSection step="01" label="Monitoring" icon={Activity}>
        {pickStr(mon, 'description') ? (
          <p className="text-[13px] text-ink-mute leading-relaxed bg-canvas-soft rounded-lg px-4 py-3">
            {pickStr(mon, 'description')}
          </p>
        ) : (
          <Note>Monitoring narrative is not available for this run.</Note>
        )}
        <KeyValueRow>
          <KV label="Severity">
            {severity ? <StatusBadge status={severity} /> : <Faint>—</Faint>}
          </KV>
          <KV label="Anomaly type">{anomalyType || '—'}</KV>
          <KV label="Detected">
            {meta.detected_at ? new Date(meta.detected_at).toLocaleString() : '—'}
          </KV>
        </KeyValueRow>
        {affectedMetrics.length > 0 && (
          <Subblock label="Affected metrics">
            <div className="flex flex-wrap gap-1.5">
              {affectedMetrics.map((m, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-info/10 text-info text-xs">
                  {m}
                </span>
              ))}
            </div>
          </Subblock>
        )}
        {logEvidence && (
          <Subblock label="Log evidence">
            <pre className="text-[11px] text-ink-mute leading-relaxed bg-canvas-soft rounded-lg px-3 py-2 font-mono whitespace-pre-wrap break-words">
              {logEvidence}
            </pre>
          </Subblock>
        )}
      </PipelineSection>

      {/* 02 — Prediction */}
      <PipelineSection step="02" label="Prediction" icon={TrendingUp}>
        {pickNum(pred, 'failure_probability') !== undefined ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <Stat
                value={`${Math.round((pickNum(pred, 'failure_probability') as number) * 100)}%`}
                label="Failure prob."
              />
              <Stat value={pickStr(pred, 'escalation_risk') || '—'} label="Escalation" />
              <Stat value={pickStr(pred, 'recommended_urgency') || '—'} label="Urgency" />
            </div>
            {pickStr(pred, 'predicted_impact') && (
              <Subblock label="Predicted impact">
                <p className="text-[13px] text-ink-mute leading-relaxed">
                  {pickStr(pred, 'predicted_impact')}
                </p>
              </Subblock>
            )}
            {pred['estimated_time_to_failure'] !== undefined &&
             pred['estimated_time_to_failure'] !== null && (
              <Subblock label="Estimated time to failure">
                <p className="text-[13px] text-ink-mute leading-relaxed">
                  {formatMinutes(pred['estimated_time_to_failure'] as number | string)}
                </p>
              </Subblock>
            )}
            {pickStr(pred, 'reasoning') && (
              <Subblock label="Model reasoning">
                <p className="text-[12px] text-ink-faint leading-relaxed">
                  {pickStr(pred, 'reasoning')}
                </p>
              </Subblock>
            )}
          </>
        ) : (
          <Note>The predictive agent produced no output for this run.</Note>
        )}
      </PipelineSection>

      {/* 03 — Diagnosis */}
      <PipelineSection step="03" label="Diagnosis" icon={Brain}>
        {rootCause && (
          <Subblock label="Root cause">
            <p className="text-[13px] text-ink-mute leading-relaxed bg-canvas-soft rounded-lg px-4 py-3">
              {rootCause}
            </p>
          </Subblock>
        )}

        {reasons.length > 0 && (
          <Subblock label="Why this happened">
            <div className="space-y-1.5">
              {reasons.map((reason, i) => (
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

        {causalChain.length > 0 && (
          <Subblock label="Causal chain">
            <ol className="space-y-1.5">
              {causalChain.map((step, i) => (
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

        {blastRadius.length > 0 && (
          <Subblock label="Blast radius">
            <div className="flex flex-wrap gap-1.5">
              {blastRadius.map((s, i) => (
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

        {recommendedActions.length > 0 && (
          <Subblock label="Recommended actions">
            <ul className="space-y-2">
              {recommendedActions.map((raw, i) => {
                const action =
                  typeof raw === 'string'
                    ? { action: raw, description: '', type: '', priority: '' }
                    : {
                        action: pickStr(raw as Dict, 'action'),
                        description: pickStr(raw as Dict, 'description'),
                        type: pickStr(raw as Dict, 'type'),
                        priority: pickStr(raw as Dict, 'priority'),
                      };
                return (
                  <li
                    key={i}
                    className="text-[13px] text-ink-mute flex items-start gap-2 leading-relaxed bg-canvas-soft rounded-lg px-3 py-2"
                  >
                    <Shield size={12} className="text-info shrink-0 mt-1" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-ink-soft font-medium">{action.action}</span>
                        {action.type && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-info/10 text-info uppercase tracking-wide">
                            {action.type}
                          </span>
                        )}
                        {action.priority && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning uppercase tracking-wide">
                            {action.priority}
                          </span>
                        )}
                      </div>
                      {action.description && (
                        <p className="mt-1 text-ink-mute">{action.description}</p>
                      )}
                    </div>
                  </li>
                );
              })}
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

        {!remediationLoading && rem && (
          <>
            {planSummary && (
              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-canvas-soft rounded-lg p-3">
                  <div className="text-ink-faint mb-1">Plan summary</div>
                  <div className="text-ink-soft leading-relaxed">{planSummary}</div>
                </div>
                <div className="bg-canvas-soft rounded-lg p-3">
                  <div className="text-ink-faint mb-1">Delivery strategy</div>
                  <div className="text-ink-soft capitalize">{strategy || 'shell'}</div>
                </div>
              </div>
            )}

            {remSteps.length > 0 && (
              <Subblock label="Simple fix steps">
                <div className="space-y-2">
                  {remSteps.map((step, index) => {
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

            {remArtifacts.length > 0 && (
              <Subblock label="Generated files">
                <ArtifactViewer
                  artifacts={remArtifacts}
                  title=""
                  emptyLabel="No remediation scripts were generated for this run."
                  downloadUrlBuilder={artifactDownloadUrl}
                />
              </Subblock>
            )}
          </>
        )}

        {!remediationLoading && !rem && (
          <Note>No remediation record was produced.</Note>
        )}
      </PipelineSection>

      {/* 05 — Reporting */}
      <PipelineSection step="05" label="Reporting" icon={FileCheck}>
        {executiveSummary && (
          <Subblock label="Executive summary">
            <p className="text-[13px] text-ink-mute leading-relaxed bg-canvas-soft rounded-lg px-4 py-3">
              {executiveSummary}
            </p>
          </Subblock>
        )}

        {runbookTitle && (
          <KeyValueRow>
            <KV label="Runbook title">{runbookTitle}</KV>
            <KV label="MTTR estimate">{mttr !== undefined ? `~${mttr} min` : '—'}</KV>
            <KV label="SLA impact">{slaImpact || '—'}</KV>
          </KeyValueRow>
        )}

        <KeyValueRow>
          <KV label="Status">
            {meta.status ? <StatusBadge status={meta.status} /> : <Faint>—</Faint>}
          </KV>
          <KV label="Resolved">
            {meta.resolved_at ? new Date(meta.resolved_at).toLocaleString() : '—'}
          </KV>
          <KV label="Filed">
            {meta.created_at ? new Date(meta.created_at).toLocaleString() : '—'}
          </KV>
        </KeyValueRow>

        {timeline.length > 0 && (
          <Subblock label="Timeline">
            <ol className="space-y-1.5">
              {timeline.map((entry, i) => (
                <li
                  key={i}
                  className="text-[12px] text-ink-mute flex items-start gap-2 leading-relaxed"
                >
                  <span className="text-[11px] font-mono text-ink-faint shrink-0 mt-0.5">
                    {pickStr(entry, 'when') || pickStr(entry, 'time') || `${i + 1}`}
                  </span>
                  <span>{pickStr(entry, 'event') || pickStr(entry, 'text') || pickStr(entry, 'description')}</span>
                </li>
              ))}
            </ol>
          </Subblock>
        )}

        {reportingNote && <Note>{reportingNote}</Note>}
      </PipelineSection>
    </div>
  );
}

/* ─── helpers ─────────────────────────────────────────────────── */

function pickStr(obj: Dict, key: string): string {
  const v = obj[key];
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') {
    const o = v as Dict;
    for (const k of ['text', 'message', 'description', 'value', 'name']) {
      if (typeof o[k] === 'string' && o[k]) return o[k] as string;
    }
    try { return JSON.stringify(v); } catch { return ''; }
  }
  return '';
}

function pickNum(obj: Dict, key: string): number | undefined {
  const v = obj[key];
  if (v === null || v === undefined) return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function pickStringArray(obj: Dict, key: string): string[] {
  const v = obj[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

function pickStringishArray(obj: Dict, key: string): string[] {
  const v = obj[key];
  if (!Array.isArray(v)) return [];
  return v.map((x) => {
    if (typeof x === 'string') return x;
    if (typeof x === 'number' || typeof x === 'boolean') return String(x);
    if (x && typeof x === 'object') {
      const o = x as Dict;
      for (const k of ['text', 'message', 'description', 'value', 'name', 'event']) {
        if (typeof o[k] === 'string' && o[k]) return o[k] as string;
      }
      try { return JSON.stringify(x); } catch { return ''; }
    }
    return '';
  }).filter(Boolean);
}

function formatMinutes(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string' && /[a-zA-Z]/.test(v)) return v;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1) return '< 1 min';
  if (n < 60) return `~${Math.round(n)} min`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return m ? `~${h} h ${m} min` : `~${h} h`;
}

/* ─── presentation atoms ─────────────────────────────────────── */

function PipelineSection({
  step, label, icon: Icon, children,
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

function Faint({ children }: { children: React.ReactNode }) {
  return <span className="text-ink-faint">{children}</span>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-canvas-soft rounded-lg p-3 text-center">
      <div className="text-lg font-bold text-ink leading-tight">{value}</div>
      <div className="text-ink-faint mt-1">{label}</div>
    </div>
  );
}
