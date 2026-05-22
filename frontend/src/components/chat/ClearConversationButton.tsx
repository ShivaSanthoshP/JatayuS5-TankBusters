import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';

/**
 * Clears the Argus conversation. The clear is irreversible (there is no chat
 * history), so it takes a two-step confirm: the first click reveals a
 * Clear / Cancel choice that auto-dismisses after a few seconds or on Esc.
 */
export default function ClearConversationButton({ onClear }: { onClear: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!confirming) return;
    // Auto-cancel so the prompt never gets stuck open.
    timerRef.current = window.setTimeout(() => setConfirming(false), 4000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirming(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      window.removeEventListener('keydown', onKey);
    };
  }, [confirming]);

  if (confirming) {
    return (
      <div className="inline-flex items-center gap-0.5 rounded-lg bg-surface/95 backdrop-blur
        ring-1 ring-hairline-strong/50 p-0.5 shadow-sm">
        <button
          type="button"
          onClick={() => { setConfirming(false); onClear(); }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
            text-[var(--color-surface)] bg-critical hover:brightness-110 transition"
        >
          <Trash2 size={13} /> Clear
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="px-2.5 py-1.5 rounded-md text-xs text-ink-mute hover:bg-ink/5 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      title="Clear conversation"
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-ink-mute
        bg-surface/70 backdrop-blur ring-1 ring-hairline-strong/50
        hover:text-critical hover:ring-critical/30 transition-colors"
    >
      <Trash2 size={13} /> Clear conversation
    </button>
  );
}
