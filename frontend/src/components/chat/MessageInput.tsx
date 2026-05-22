import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ArrowUp, Square } from 'lucide-react';
import { useQuestionSuggestions } from '../../hooks/useQuestionSuggestions';
import SuggestionList from './SuggestionList';

const MAX_TEXTAREA_HEIGHT = 200;

export default function MessageInput({
  onSend, onStop, disabled,
}: { onSend: (text: string) => void; onStop: () => void; disabled: boolean }) {
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

  // Auto-grow the textarea to fit its content, ChatGPT-style — one line at
  // rest, expanding up to a cap, then scrolling.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [draft]);

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

        {/* The pill IS the textbox — a <label> so a click anywhere focuses the
            textarea. Text on top, controls row below, ChatGPT-style. */}
        <label
          className="flex flex-col rounded-[28px] bg-surface px-4 pt-3 pb-2.5 cursor-text
            ring-1 ring-hairline-strong/70 shadow-[0_10px_34px_-14px_rgba(21,25,26,0.42)]
            transition-shadow focus-within:ring-accent/45"
        >
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            placeholder="Ask Argus…"
            disabled={disabled}
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            className="w-full bg-transparent text-sm leading-6 text-ink resize-none
              focus:outline-none placeholder:text-ink-faint disabled:opacity-60
              max-h-[200px] overflow-y-auto"
          />

          {/* Controls row */}
          <div className="flex items-center justify-end mt-1.5">
            {disabled ? (
              // Processing — spinning ring around a stop square; click to halt.
              <button
                type="button"
                onClick={onStop}
                title="Stop generating"
                aria-label="Stop generating"
                className="relative shrink-0 w-8 h-8 rounded-full flex items-center justify-center
                  bg-accent/10 hover:bg-accent/15 transition-colors"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full border-2 border-accent/25 border-t-accent animate-spin"
                />
                <Square size={10} className="text-accent" fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!draft.trim()}
                title="Send"
                aria-label="Send message"
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center
                  bg-accent text-[var(--color-surface)] transition-opacity
                  disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ArrowUp size={17} strokeWidth={2.6} />
              </button>
            )}
          </div>
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
