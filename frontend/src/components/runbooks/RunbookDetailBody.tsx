import { useCallback, useState } from 'react';
import {
  Shield, Wrench, FileText, Copy, Check,
} from 'lucide-react';
import { palette } from '../../lib/theme';
import type { RunbookEntry } from '../../types';

interface RunbookDetailBodyProps {
  runbook: RunbookEntry;
}

/**
 * Pure body layout for one runbook — every field the old expand-in-place
 * accordion used to render, preserved one-for-one. Container-agnostic so
 * the new /runbooks/:id page (and anything else later) can mount it.
 */
export default function RunbookDetailBody({ runbook: rb }: RunbookDetailBodyProps) {
  const remediationSteps = (rb.remediation_steps ?? []) as Array<Record<string, unknown>>;
  const recommendedActions = (rb.recommended_actions ?? []) as Array<Record<string, unknown>>;
  const blastSeverityColor =
    rb.blast_radius_severity === 'critical' ? palette.critical :
    rb.blast_radius_severity === 'high'     ? palette.warning :
    rb.blast_radius_severity === 'medium'   ? palette.warning :
    palette.success;

  const fixStepsText = remediationSteps.length > 0
    ? remediationSteps.map((s, i) =>
        `${i + 1}. ${s['action'] ?? ''}${s['description'] ? '\n   ' + s['description'] : ''}`
      ).join('\n')
    : rb.solution_steps ?? '';

  return (
    <div className="space-y-6">
      {/* Problem pattern */}
      <section>
        <SectionHead label="Problem pattern" />
        <p className="text-[13px] text-ink-mute bg-canvas-soft px-4 py-3 rounded-lg leading-relaxed">
          {rb.problem_pattern}
        </p>
      </section>

      {/* Root cause */}
      {rb.root_cause && (
        <section>
          <SectionHead label="Root cause" />
          <p className="text-[13px] text-ink-mute bg-accent/8 px-4 py-3 rounded-lg leading-relaxed">
            {rb.root_cause}
          </p>
        </section>
      )}

      {/* Causal chain */}
      {rb.causal_chain && rb.causal_chain.length > 0 && (
        <section>
          <SectionHead label="Causal chain" />
          <ol className="space-y-1.5">
            {rb.causal_chain.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-ink-soft">
                <span className="w-5 h-5 rounded-full bg-ink/8 flex items-center justify-center text-[10px] font-mono text-ink-mute shrink-0 mt-px">
                  {i + 1}
                </span>
                <span className="leading-relaxed pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Blast radius */}
      {rb.blast_radius && rb.blast_radius.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-[12px] font-semibold text-ink-soft">Blast radius</h3>
            {rb.blast_radius_severity && (
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{
                  background: `${blastSeverityColor}15`,
                  color: blastSeverityColor,
                  border: `1px solid ${blastSeverityColor}33`,
                }}
              >
                {rb.blast_radius_severity}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {rb.blast_radius.map((s, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-md text-[11px]"
                style={{
                  background: `${blastSeverityColor}10`,
                  color: blastSeverityColor,
                  border: `1px solid ${blastSeverityColor}26`,
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Recommended actions */}
      {recommendedActions.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <Shield size={12} className="text-accent" />
            <h3 className="text-[12px] font-semibold text-ink-soft">Recommended actions</h3>
          </div>
          <div className="space-y-1.5">
            {recommendedActions.map((act, i) => {
              const action = String(act['action'] ?? `Action ${i + 1}`);
              const description = act['description'] ? String(act['description']) : '';
              return (
                <div key={i} className="bg-warning/8 border border-warning/20 rounded-lg px-3 py-2">
                  <div className="text-[13px] font-medium text-ink-soft">{action}</div>
                  {description && (
                    <div className="text-[12px] text-ink-mute mt-1 leading-relaxed">
                      {description}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Remediation summary */}
      {rb.remediation_summary && (
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <Wrench size={12} className="text-warning" />
            <h3 className="text-[12px] font-semibold text-ink-soft">Fix summary</h3>
          </div>
          <p className="text-[13px] text-ink-mute bg-warning/8 px-4 py-3 rounded-lg leading-relaxed">
            {rb.remediation_summary}
          </p>
        </section>
      )}

      {/* Remediation steps */}
      {remediationSteps.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[12px] font-semibold text-ink-soft">Fix steps</h3>
            {fixStepsText && <CopyButton text={fixStepsText} label="Copy steps" />}
          </div>
          <ol className="space-y-1.5">
            {remediationSteps.map((step, i) => {
              const action = String(step['action'] ?? `Step ${i + 1}`);
              const description = step['description'] ? String(step['description']) : '';
              return (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-warning/15 flex items-center justify-center text-[10px] font-mono text-warning shrink-0 mt-px">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-ink-soft">{action}</div>
                    {description && (
                      <div className="text-[12px] text-ink-mute mt-0.5 leading-relaxed">
                        {description}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* Raw solution_steps fallback — only when structured fields are empty */}
      {!rb.remediation_summary && remediationSteps.length === 0 && rb.solution_steps && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <FileText size={12} className="text-ink-mute" />
              <h3 className="text-[12px] font-semibold text-ink-soft">Solution</h3>
            </div>
            <CopyButton text={rb.solution_steps} label="Copy" />
          </div>
          <pre className="text-[13px] text-ink-mute bg-canvas-soft px-4 py-3 rounded-lg whitespace-pre-wrap font-sans leading-relaxed">
            {rb.solution_steps}
          </pre>
        </section>
      )}
    </div>
  );
}

function SectionHead({ label }: { label: string }) {
  return <h3 className="text-[12px] font-semibold text-ink-soft mb-2">{label}</h3>;
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);
  return (
    <button
      onClick={copy}
      title={label}
      className="flex items-center gap-1 text-[10px] text-ink-faint hover:text-ink-soft transition-colors px-1.5 py-0.5 rounded hover:bg-ink/5"
    >
      {copied ? <Check size={10} className="text-success" /> : <Copy size={10} />}
      {copied ? 'Copied!' : label}
    </button>
  );
}
