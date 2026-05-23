import { BookOpen, ArrowRight, AlertTriangle } from 'lucide-react';
import { runbookDraft } from '../../hooks/useRunbookDraft';
import type { RunbookDraftResult } from '../../types';

/**
 * Rendered when Argus calls `draft_runbook`. Shows the drafted runbook and a
 * button that opens the structured form prefilled — the user reviews, edits,
 * and saves there. Nothing is persisted until they hit Create.
 */
export default function RunbookDraftCard({ result }: { result: RunbookDraftResult }) {
  const { draft, issue_type_exists, note } = result;
  const stepCount = draft.remediation_steps?.length ?? 0;
  const actionCount = draft.recommended_actions?.length ?? 0;

  return (
    <div className="glass-sm p-3 space-y-2 border border-accent/20">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-accent/10 flex items-center justify-center shrink-0">
          <BookOpen size={12} className="text-accent" />
        </div>
        <span className="text-xs font-semibold text-ink-soft truncate">
          {draft.title || 'Untitled runbook'}
        </span>
        {draft.issue_type && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink/8 text-ink-soft font-mono shrink-0">
            {draft.issue_type}
          </span>
        )}
      </div>

      <p className="text-[11px] text-ink-mute">
        Draft runbook · {actionCount} action{actionCount === 1 ? '' : 's'} · {stepCount} step{stepCount === 1 ? '' : 's'}
      </p>

      {issue_type_exists && (
        <div className="flex items-start gap-1.5 text-[11px] text-warning bg-warning/8 border border-warning/20 rounded-md px-2 py-1.5">
          <AlertTriangle size={12} className="shrink-0 mt-px" />
          <span>{note}</span>
        </div>
      )}

      <button
        onClick={() => runbookDraft.openPrefill(draft)}
        className="flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
      >
        Review &amp; save runbook <ArrowRight size={12} />
      </button>
    </div>
  );
}
