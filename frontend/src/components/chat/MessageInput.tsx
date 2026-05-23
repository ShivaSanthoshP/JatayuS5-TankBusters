import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ArrowUp, Mic, Square } from 'lucide-react';
import { useQuestionSuggestions } from '../../hooks/useQuestionSuggestions';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import SuggestionList from './SuggestionList';
import VoiceWave from './VoiceWave';

export default function MessageInput({
  onSend, onStop, disabled,
}: { onSend: (text: string) => void; onStop: () => void; disabled: boolean }) {
  const [draft, setDraft] = useState('');
  // activeIndex -1 means no row highlighted — Enter still sends the typed text.
  const [activeIndex, setActiveIndex] = useState(-1);
  // Esc / a pick close the dropdown until the user types again.
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Push-to-talk needs the current draft (Space-while-input-focused should
  // dictate when draft is empty, type a space otherwise) and a cancel flag for
  // the race where the user releases Space before voice.start() resolves.
  const draftRef = useRef('');
  useEffect(() => { draftRef.current = draft; }, [draft]);
  const cancelHoldRef = useRef(false);

  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const suggestions = useQuestionSuggestions(draft);

  const voice = useVoiceInput({
    lang: 'en-IN',
    // Word-by-word streaming: each partial result flows straight into the
    // textbox (which is read-only while listening, so it can't fight back).
    onTranscript: (text) => { setDraft(text); },
    onFinal: (text) => {
      // Final polished transcript lands in the textbox — user reviews & Enter.
      setDraft(text);
      setActiveIndex(-1);
      setDismissed(true); // don't pop suggestions over a freshly-dictated draft
      requestAnimationFrame(() => inputRef.current?.focus());
    },
  });
  const isListening = voice.status === 'listening';

  // ── Push-to-talk: hold Space to dictate, release to stop ───────────────
  // Skips when the user is typing in any input/textarea/contenteditable, with
  // one exception — our own chat input when it's empty (common right after
  // sending a message, where the input keeps focus). preventDefault on the
  // keydown suppresses both page scroll and the literal space character.
  useEffect(() => {
    if (!voice.functional || disabled) return;
    const isTypingElement = (el: Element | null): boolean => {
      if (!el || el === document.body) return false;
      const tag = el.tagName;
      if (tag === 'TEXTAREA') return true;
      if ((el as HTMLElement).isContentEditable) return true;
      if (tag === 'INPUT') {
        // Allow PTT when our own chat input is focused but empty.
        if (el === inputRef.current && draftRef.current.trim().length === 0) {
          return false;
        }
        return true;
      }
      return false;
    };
    const onDown = (e: globalThis.KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      if (isTypingElement(document.activeElement)) return;
      e.preventDefault();
      cancelHoldRef.current = false;
      void (async () => {
        await voice.start();
        // User released Space before getUserMedia resolved — stop immediately.
        if (cancelHoldRef.current) voice.stop();
      })();
    };
    const onUp = (e: globalThis.KeyboardEvent) => {
      if (e.code !== 'Space') return;
      cancelHoldRef.current = true;
      voice.stop();
    };
    document.addEventListener('keydown', onDown);
    document.addEventListener('keyup', onUp);
    return () => {
      document.removeEventListener('keydown', onDown);
      document.removeEventListener('keyup', onUp);
    };
  }, [voice, disabled]);

  const open = !disabled && !isListening && !dismissed && suggestions.length > 0;

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
            name="message"
            id="argus-message"
            autoComplete="off"
            value={draft}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKey}
            placeholder={isListening ? 'Listening…' : 'Ask Argus…'}
            disabled={disabled}
            readOnly={isListening}
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            className="chat-pill-input flex-1 min-w-0 py-1.5 text-sm text-ink
              placeholder:text-ink-faint focus:outline-none disabled:opacity-60"
          />

          {/* Inline wave confirms the mic is live while words stream in. */}
          {isListening && <VoiceWave bars={voice.bars} compact />}

          {/* Mic — only when idle, usable here, mic not blocked, not generating. */}
          {!isListening && !disabled && voice.functional && voice.permission !== 'denied' && (
            <button
              type="button"
              onClick={() => { void voice.start(); }}
              title="Speak — or hold Space"
              aria-label="Speak (or hold the Space key to talk)"
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center
                text-ink-mute hover:text-ink hover:bg-ink/5 transition-colors"
            >
              <Mic size={16} />
            </button>
          )}

          {/* Right action: stop-listening · stop-generating · send. */}
          {isListening ? (
            <button
              type="button"
              onClick={voice.stop}
              title="Stop and insert transcript"
              aria-label="Stop listening"
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center
                bg-accent text-[var(--color-surface)] transition-opacity"
            >
              <Square size={11} fill="currentColor" />
            </button>
          ) : disabled ? (
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

        {open ? (
          <div className="px-4 pt-1.5 hidden sm:block text-[10px] text-ink-faint">
            ↑↓ or Tab to move · Enter to pick · Esc to dismiss
          </div>
        ) : isListening ? (
          <div className="px-4 pt-1.5 hidden sm:block text-[10px] text-ink-faint">
            Listening… release <span className="font-mono text-ink-mute">Space</span> (or click stop) to insert
          </div>
        ) : disabled ? null : !voice.functional ? (
          <div className="px-4 pt-1.5 hidden sm:block text-[10px] text-ink-faint">
            Voice input isn't available in this browser. Try Chrome, Edge, or Safari.
          </div>
        ) : voice.permission === 'denied' ? (
          <div className="px-4 pt-1.5 hidden sm:block text-[10px] text-ink-faint">
            Microphone blocked — enable it in your browser settings to use voice.
          </div>
        ) : (
          <div className="px-4 pt-1.5 hidden sm:block text-[10px] text-ink-faint">
            Hold <span className="font-mono text-ink-mute">Space</span> to talk · or click the mic
          </div>
        )}
      </div>
    </div>
  );
}
