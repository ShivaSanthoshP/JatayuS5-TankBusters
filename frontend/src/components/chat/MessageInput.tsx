import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ArrowUp, Square } from 'lucide-react';
import { useQuestionSuggestions } from '../../hooks/useQuestionSuggestions';
import SuggestionList from './SuggestionList';

export default function MessageInput({
  onSend, onStop, disabled,
}: { onSend: (text: string) => void; onStop: () => void; disabled: boolean }) {
  const [draft, setDraft] = useState('');
  // activeIndex -1 means no row highlighted — Enter still sends the typed text.
  const [activeIndex, setActiveIndex] = useState(-1);
  // Esc / a pick close the dropdown until the user types again.
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    // Focus, and select the first {placeholder} so the next keystroke replaces
    // it; otherwise drop the caret at the end.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const m = q.text.match(/\{[^}]+\}/);
      if (m && m.index !== undefined) {
        el.setSelectionRange(m.index, m.index + m[0].length);
      } else {
        el.setSelectionRange(q.text.length, q.text.length);
      }
    });
  };

  const onChange = (value: string) => {
    setDraft(value.slice(0, 1000));
    setActiveIndex(-1);
    setDismissed(false); // typing re-opens the dropdown
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
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
      if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        pick(activeIndex);
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="px-3 sm:px-4 pt-2 pb-3 sm:pb-4">
      <div className="relative mx-auto w-full max-w-3xl">
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

        {/* One horizontal pill — text fills the left, send button on the right.
            A <label> so a click anywhere focuses the input; the input is
            borderless and transparent, so the text sits directly in the pill. */}
        <label
          className="flex items-center gap-2 rounded-full bg-surface pl-5 pr-2 py-2 cursor-text
            ring-1 ring-hairline-strong/70 shadow-[0_10px_34px_-14px_rgba(21,25,26,0.42)]
            transition-shadow focus-within:ring-accent/45"
        >
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask Argus…"
            disabled={disabled}
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            className="chat-pill-input flex-1 min-w-0 py-1.5 text-sm text-ink
              placeholder:text-ink-faint focus:outline-none disabled:opacity-60"
          />

          {disabled ? (
            // Processing — spinning ring around a stop square; click to halt.
            <button
              type="button"
              onClick={onStop}
              title="Stop generating"
              aria-label="Stop generating"
              className="relative shrink-0 w-9 h-9 rounded-full flex items-center justify-center
                bg-accent/10 hover:bg-accent/15 transition-colors"
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full border-2 border-accent/25 border-t-accent animate-spin"
              />
              <Square size={11} className="text-accent" fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim()}
              title="Send"
              aria-label="Send message"
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center
                bg-accent text-[var(--color-surface)] transition-opacity
                disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ArrowUp size={18} strokeWidth={2.6} />
            </button>
          )}
        </label>

        {open && (
          <div className="px-4 pt-1.5 hidden sm:block text-[10px] text-ink-faint">
            ↑↓ or Tab to move · Enter to pick · Esc to dismiss
          </div>
        )}
      </div>
    </div>
  );
}
