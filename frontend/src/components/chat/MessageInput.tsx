import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Send } from 'lucide-react';
import { useQuestionSuggestions } from '../../hooks/useQuestionSuggestions';
import SuggestionList from './SuggestionList';

export default function MessageInput({
  onSend, disabled,
}: { onSend: (text: string) => void; disabled: boolean }) {
  const [draft, setDraft] = useState('');
  // activeIndex -1 means no row highlighted — Enter still sends the typed text.
  const [activeIndex, setActiveIndex] = useState(-1);
  // Esc / a pick close the dropdown until the user types again.
  const [dismissed, setDismissed] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const suggestions = useQuestionSuggestions(draft);
  const open = !disabled && !dismissed && suggestions.length > 0;

  const submit = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    onSend(text);
    setDraft('');
    setActiveIndex(-1);
    setDismissed(false);
  };

  const pick = (i: number) => {
    const q = suggestions[i];
    if (!q) return;
    setDraft(q.text);
    setActiveIndex(-1);
    setDismissed(true); // stay closed until the next keystroke
    // After the value updates: focus, and select the first {placeholder} so the
    // user's next keystroke replaces it; otherwise drop the caret at the end.
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      const m = q.text.match(/\{[^}]+\}/);
      if (m && m.index !== undefined) {
        ta.setSelectionRange(m.index, m.index + m[0].length);
      } else {
        ta.setSelectionRange(q.text.length, q.text.length);
      }
    });
  };

  const onChange = (value: string) => {
    setDraft(value.slice(0, 1000));
    setActiveIndex(-1);
    setDismissed(false); // typing re-opens the dropdown
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissed(true);
        setActiveIndex(-1);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && activeIndex >= 0) {
        e.preventDefault();
        pick(activeIndex);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-hairline-strong/60 bg-surface/80">
      <div className="relative mx-auto w-full max-w-3xl p-2 flex items-end gap-2">
        <AnimatePresence>
          {open && (
            <SuggestionList
              suggestions={suggestions}
              activeIndex={activeIndex}
              listId={listId}
              optionId={optionId}
              onHover={setActiveIndex}
              onPick={pick}
            />
          )}
        </AnimatePresence>
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          placeholder="Ask Argus…"
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
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
      {open && (
        <div className="mx-auto w-full max-w-3xl px-3 pb-1 hidden sm:block text-[10px] text-ink-faint">
          ↑↓ or Tab to move · Enter to pick · Esc to dismiss
        </div>
      )}
    </div>
  );
}
