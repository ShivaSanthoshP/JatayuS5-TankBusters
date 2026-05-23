import RunbookFormModal from './RunbookFormModal';
import { useRunbookDraft, runbookDraft, RUNBOOKS_CHANGED_EVENT } from '../../hooks/useRunbookDraft';

/**
 * One runbook form for the whole app, mounted in Layout. Driven by the global
 * draft store so it can be opened from the Runbooks page (New / Edit) or from
 * an Argus chat draft, and overlays whatever page the user is on.
 */
export default function GlobalRunbookForm() {
  const { open, entry, prefill } = useRunbookDraft();
  if (!open) return null;
  return (
    <RunbookFormModal
      initial={entry}
      prefill={prefill}
      onClose={runbookDraft.close}
      onSaved={() => window.dispatchEvent(new CustomEvent(RUNBOOKS_CHANGED_EVENT))}
    />
  );
}
