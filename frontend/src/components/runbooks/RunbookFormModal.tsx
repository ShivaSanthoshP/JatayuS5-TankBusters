import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Trash2, ChevronDown } from 'lucide-react';
import * as api from '../../services/api';
import type {
  RunbookEntry, RunbookWrite,
  RecommendedActionInput, RemediationStepInput, RunbookArtifactInput,
} from '../../types';

const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
const RISK_LEVELS = ['low', 'medium', 'high'] as const;

/* ── small coercion helpers for the edit case ─────────────── */
const str = (v: unknown): string => (v == null ? '' : String(v));
const num = (v: unknown): number | null =>
  v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v);

const asRows = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as Record<string, unknown>[]) : [];

function toActions(rows: unknown): RecommendedActionInput[] {
  return asRows(rows).map(r => ({
    action: str(r.action), type: str(r.type) || null,
    priority: num(r.priority), description: str(r.description) || null,
  }));
}
function toSteps(rows: unknown): RemediationStepInput[] {
  return asRows(rows).map((r, i) => ({
    order: num(r.order) ?? i + 1, action: str(r.action),
    action_type: str(r.action_type) || null, description: str(r.description) || null,
    script: str(r.script) || null, validation_command: str(r.validation_command) || null,
    rollback_script: str(r.rollback_script) || null,
    risk_level: str(r.risk_level) || 'low',
    estimated_duration_seconds: num(r.estimated_duration_seconds),
  }));
}
function toArtifacts(rows: unknown): RunbookArtifactInput[] {
  return asRows(rows).map(r => ({
    id: str(r.id) || null, name: str(r.name), kind: str(r.kind) || 'shell',
    language: str(r.language) || 'bash', purpose: str(r.purpose) || 'apply',
    description: str(r.description) || null, content: str(r.content),
  }));
}

/* ── styling shorthands ───────────────────────────────────── */
const inputCls =
  'w-full bg-black/5 border border-glass-border rounded-lg px-3 py-2 text-sm text-ink ' +
  'placeholder:text-ink-faint focus:outline-none focus:border-accent/50';
const labelCls = 'text-xs font-semibold text-ink-soft block mb-1';
const sectionCls = 'text-xs font-bold uppercase tracking-wide text-ink-mute pt-2';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-t border-glass-border pt-4">
      <div className={sectionCls}>{title}</div>
      {children}
    </div>
  );
}

/* Reorderable-free string list (causal chain, blast radius). */
function StringList({
  label, values, placeholder, onChange,
}: { label: string; values: string[]; placeholder: string; onChange: (v: string[]) => void }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="space-y-1.5">
        {values.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className={inputCls}
              value={v}
              placeholder={placeholder}
              onChange={e => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button
              type="button"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              className="p-1.5 rounded hover:bg-critical/10 shrink-0"
              title="Remove"
            >
              <Trash2 size={13} className="text-critical/70" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...values, ''])}
          className="flex items-center gap-1 text-xs text-accent hover:underline"
        >
          <Plus size={12} /> Add
        </button>
      </div>
    </div>
  );
}

interface Props {
  /** Editing an existing runbook (has an id) — submits via PUT. */
  initial?: RunbookEntry | null;
  /** Prefill for a new runbook (e.g. an Argus draft) — submits via POST. */
  prefill?: RunbookWrite | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function RunbookFormModal({ initial, prefill, onClose, onSaved }: Props) {
  const editing = !!initial;
  // Edit an existing entry, or prefill a new one from a draft — both share field names.
  const src = initial ?? prefill ?? null;
  const [title, setTitle] = useState(str(src?.title));
  const [issueType, setIssueType] = useState(str(src?.issue_type));
  const [problemPattern, setProblemPattern] = useState(str(src?.problem_pattern));
  const [rootCause, setRootCause] = useState(str(src?.root_cause));
  const [causalChain, setCausalChain] = useState<string[]>(src?.causal_chain ?? []);
  const [blastRadius, setBlastRadius] = useState<string[]>(src?.blast_radius ?? []);
  const [severity, setSeverity] = useState(str(src?.blast_radius_severity));
  const [actions, setActions] = useState<RecommendedActionInput[]>(toActions(src?.recommended_actions));
  const [summary, setSummary] = useState(str(src?.remediation_summary));
  const [steps, setSteps] = useState<RemediationStepInput[]>(toSteps(src?.remediation_steps));
  const [artifacts, setArtifacts] = useState<RunbookArtifactInput[]>(toArtifacts(src?.artifacts));
  const [solutionSteps, setSolutionSteps] = useState(str(src?.solution_steps));
  const [showSolution, setShowSolution] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = title.trim().length > 0 && problemPattern.trim().length > 0 && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const payload: RunbookWrite = {
      title: title.trim(),
      issue_type: issueType.trim() || null,
      problem_pattern: problemPattern.trim(),
      solution_steps: solutionSteps.trim() || null,
      root_cause: rootCause.trim() || null,
      causal_chain: causalChain.map(s => s.trim()).filter(Boolean),
      blast_radius: blastRadius.map(s => s.trim()).filter(Boolean),
      blast_radius_severity: severity || null,
      recommended_actions: actions.filter(a => a.action.trim()),
      remediation_summary: summary.trim() || null,
      remediation_steps: steps.filter(s => s.action.trim()).map((s, i) => ({ ...s, order: i + 1 })),
      artifacts: artifacts.filter(a => a.name.trim() && a.content.trim()),
    };
    try {
      if (editing && initial) await api.updateRunbook(initial.id, payload);
      else await api.createRunbook(payload);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass w-full max-w-2xl my-auto max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-glass-border sticky top-0 bg-surface/95 backdrop-blur z-10">
          <h2 className="text-base font-semibold text-ink">
            {editing ? 'Edit runbook' : 'New canonical runbook'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-ink/5" title="Close">
            <X size={16} className="text-ink-mute" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Identity */}
          <div>
            <label className={labelCls}>Title *</label>
            <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Thread Pool Starvation Recovery" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Issue type</label>
              <input className={inputCls} value={issueType} onChange={e => setIssueType(e.target.value)}
                placeholder="e.g. thread_pool_starvation" />
              <p className="text-[10px] text-ink-faint mt-1">
                Unique key the pipeline matches on. Lowercase_with_underscores.
              </p>
            </div>
            <div>
              <label className={labelCls}>Blast radius severity</label>
              <select className={inputCls} value={severity} onChange={e => setSeverity(e.target.value)}>
                <option value="">—</option>
                {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Problem pattern *</label>
            <textarea className={inputCls} rows={2} value={problemPattern}
              onChange={e => setProblemPattern(e.target.value)}
              placeholder="The symptom pattern that triggers this runbook" />
          </div>

          {/* Diagnosis */}
          <Section title="Diagnosis">
            <div>
              <label className={labelCls}>Root cause</label>
              <textarea className={inputCls} rows={2} value={rootCause}
                onChange={e => setRootCause(e.target.value)} />
            </div>
            <StringList label="Causal chain" values={causalChain} onChange={setCausalChain}
              placeholder="One step in the failure sequence" />
            <StringList label="Blast radius" values={blastRadius} onChange={setBlastRadius}
              placeholder="A system/service affected" />
          </Section>

          {/* Recommended actions */}
          <Section title="Recommended actions">
            <div className="space-y-2">
              {actions.map((a, i) => (
                <div key={i} className="glass-sm p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <input className={inputCls} value={a.action} placeholder="Action"
                      onChange={e => setActions(actions.map((x, j) => j === i ? { ...x, action: e.target.value } : x))} />
                    <button type="button" onClick={() => setActions(actions.filter((_, j) => j !== i))}
                      className="p-1.5 rounded hover:bg-critical/10 shrink-0" title="Remove">
                      <Trash2 size={13} className="text-critical/70" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input className={inputCls} value={str(a.type)} placeholder="type (e.g. restart_service)"
                      onChange={e => setActions(actions.map((x, j) => j === i ? { ...x, type: e.target.value || null } : x))} />
                    <input className={inputCls} type="number" value={a.priority ?? ''} placeholder="priority"
                      onChange={e => setActions(actions.map((x, j) => j === i ? { ...x, priority: num(e.target.value) } : x))} />
                    <input className={inputCls} value={str(a.description)} placeholder="description"
                      onChange={e => setActions(actions.map((x, j) => j === i ? { ...x, description: e.target.value || null } : x))} />
                  </div>
                </div>
              ))}
              <button type="button"
                onClick={() => setActions([...actions, { action: '', type: null, priority: actions.length + 1, description: null }])}
                className="flex items-center gap-1 text-xs text-accent hover:underline">
                <Plus size={12} /> Add action
              </button>
            </div>
          </Section>

          {/* Remediation */}
          <Section title="Remediation">
            <div>
              <label className={labelCls}>Plan summary</label>
              <textarea className={inputCls} rows={2} value={summary}
                onChange={e => setSummary(e.target.value)} />
            </div>
            <label className={labelCls}>Steps</label>
            <div className="space-y-2">
              {steps.map((s, i) => (
                <div key={i} className="glass-sm p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-ink-mute shrink-0 w-6 text-center">{i + 1}</span>
                    <input className={inputCls} value={s.action} placeholder="Step action"
                      onChange={e => setSteps(steps.map((x, j) => j === i ? { ...x, action: e.target.value } : x))} />
                    <button type="button" onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                      className="p-1.5 rounded hover:bg-critical/10 shrink-0" title="Remove">
                      <Trash2 size={13} className="text-critical/70" />
                    </button>
                  </div>
                  <input className={inputCls} value={str(s.description)} placeholder="description"
                    onChange={e => setSteps(steps.map((x, j) => j === i ? { ...x, description: e.target.value || null } : x))} />
                  <textarea className={`${inputCls} font-mono text-xs`} rows={2} value={str(s.script)} placeholder="script (bash)"
                    onChange={e => setSteps(steps.map((x, j) => j === i ? { ...x, script: e.target.value || null } : x))} />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input className={inputCls} value={str(s.action_type)} placeholder="action_type"
                      onChange={e => setSteps(steps.map((x, j) => j === i ? { ...x, action_type: e.target.value || null } : x))} />
                    <select className={inputCls} value={str(s.risk_level) || 'low'}
                      onChange={e => setSteps(steps.map((x, j) => j === i ? { ...x, risk_level: e.target.value } : x))}>
                      {RISK_LEVELS.map(r => <option key={r} value={r}>{`risk: ${r}`}</option>)}
                    </select>
                    <input className={inputCls} type="number" value={s.estimated_duration_seconds ?? ''} placeholder="duration (s)"
                      onChange={e => setSteps(steps.map((x, j) => j === i ? { ...x, estimated_duration_seconds: num(e.target.value) } : x))} />
                  </div>
                  <input className={inputCls} value={str(s.validation_command)} placeholder="validation_command"
                    onChange={e => setSteps(steps.map((x, j) => j === i ? { ...x, validation_command: e.target.value || null } : x))} />
                </div>
              ))}
              <button type="button"
                onClick={() => setSteps([...steps, { order: steps.length + 1, action: '', risk_level: 'low' }])}
                className="flex items-center gap-1 text-xs text-accent hover:underline">
                <Plus size={12} /> Add step
              </button>
            </div>
          </Section>

          {/* Artifacts */}
          <Section title="Artifacts (scripts)">
            <div className="space-y-2">
              {artifacts.map((a, i) => (
                <div key={i} className="glass-sm p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <input className={inputCls} value={a.name} placeholder="filename (e.g. remediate.sh)"
                      onChange={e => setArtifacts(artifacts.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                    <input className={`${inputCls} max-w-[120px]`} value={str(a.purpose)} placeholder="purpose"
                      onChange={e => setArtifacts(artifacts.map((x, j) => j === i ? { ...x, purpose: e.target.value || null } : x))} />
                    <button type="button" onClick={() => setArtifacts(artifacts.filter((_, j) => j !== i))}
                      className="p-1.5 rounded hover:bg-critical/10 shrink-0" title="Remove">
                      <Trash2 size={13} className="text-critical/70" />
                    </button>
                  </div>
                  <textarea className={`${inputCls} font-mono text-xs`} rows={3} value={a.content} placeholder="#!/usr/bin/env bash"
                    onChange={e => setArtifacts(artifacts.map((x, j) => j === i ? { ...x, content: e.target.value } : x))} />
                </div>
              ))}
              <button type="button"
                onClick={() => setArtifacts([...artifacts, { name: '', purpose: 'apply', kind: 'shell', language: 'bash', content: '' }])}
                className="flex items-center gap-1 text-xs text-accent hover:underline">
                <Plus size={12} /> Add artifact
              </button>
            </div>
          </Section>

          {/* Optional raw solution text */}
          <div className="border-t border-glass-border pt-3">
            <button type="button" onClick={() => setShowSolution(v => !v)}
              className="flex items-center gap-1 text-xs text-ink-mute hover:text-ink-soft">
              <ChevronDown size={13} className={showSolution ? 'rotate-180 transition-transform' : 'transition-transform'} />
              Advanced: solution text override
            </button>
            {showSolution && (
              <div className="mt-2">
                <textarea className={`${inputCls} font-mono text-xs`} rows={3} value={solutionSteps}
                  onChange={e => setSolutionSteps(e.target.value)}
                  placeholder="Leave blank — auto-composed from the fields above." />
              </div>
            )}
          </div>

          {error && (
            <div className="text-xs text-critical bg-critical/10 border border-critical/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-glass-border sticky bottom-0 bg-surface/95 backdrop-blur">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-ink-soft hover:bg-ink/5">
            Cancel
          </button>
          <button onClick={submit} disabled={!canSave}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create runbook'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
