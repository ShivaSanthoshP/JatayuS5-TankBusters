import { useState, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';

export default function MessageInput({
  onSend, disabled,
}: { onSend: (text: string) => void; disabled: boolean }) {
  const [draft, setDraft] = useState('');
  const submit = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    onSend(text);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };
  return (
    <div className="border-t border-hairline-strong/60 bg-surface/80">
      <div className="mx-auto w-full max-w-3xl p-2 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
          onKeyDown={onKey}
          rows={2}
          placeholder="Ask the copilot…"
          disabled={disabled}
          className="flex-1 bg-transparent text-sm text-ink resize-none focus:outline-none placeholder:text-ink-faint disabled:opacity-50"
        />
        <button
          onClick={submit}
          disabled={disabled || !draft.trim()}
          className="p-2 rounded-lg bg-accent text-[var(--color-surface)] disabled:opacity-40"
          title="Send"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
