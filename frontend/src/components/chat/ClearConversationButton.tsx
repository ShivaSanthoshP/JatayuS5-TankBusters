import { Trash2 } from 'lucide-react';

/**
 * Clears the Argus conversation immediately on click — no confirm step.
 * The chat history is purely UI state; a stray click is recoverable by just
 * starting a new turn, so the confirm prompt was friction without value.
 */
export default function ClearConversationButton({ onClear }: { onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      title="Clear conversation"
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-ink-mute
        bg-surface/70 backdrop-blur ring-1 ring-hairline-strong/50
        hover:text-critical hover:ring-critical/30 transition-colors"
    >
      <Trash2 size={13} /> Clear conversation
    </button>
  );
}
