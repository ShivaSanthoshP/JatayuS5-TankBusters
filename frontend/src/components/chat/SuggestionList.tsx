import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { spring } from '../../lib/motion';
import type { Suggestion } from '../../hooks/useQuestionSuggestions';

/** Renders the question text with fuzzy-matched character spans bolded. */
function Highlighted({ text, ranges }: { text: string; ranges: Array<[number, number]> }) {
  if (!ranges.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(<span key={`p${i}`}>{text.slice(cursor, start)}</span>);
    parts.push(
      <strong key={`m${i}`} className="font-semibold text-ink">
        {text.slice(start, end)}
      </strong>,
    );
    cursor = end;
  });
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>);
  return <>{parts}</>;
}

interface SuggestionListProps {
  suggestions: Suggestion[];
  activeIndex: number;
  listId: string;
  optionId: (i: number) => string;
  onHover: (i: number) => void;
  onPick: (i: number) => void;
}

/**
 * Presentational typeahead dropdown — opens upward (the input is bottom-pinned).
 * Stateless: the parent owns activeIndex and all selection logic.
 */
export default function SuggestionList({
  suggestions,
  activeIndex,
  listId,
  optionId,
  onHover,
  onPick,
}: SuggestionListProps) {
  return (
    <motion.ul
      id={listId}
      role="listbox"
      aria-label="Question suggestions"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={spring.snappy}
      className="absolute bottom-full left-0 right-0 mb-1.5 z-30 overflow-hidden rounded-xl
        bg-surface/95 backdrop-blur ring-1 ring-hairline-strong/60 shadow-lg"
    >
      {suggestions.map((s, i) => (
        <li
          key={s.text}
          id={optionId(i)}
          role="option"
          aria-selected={i === activeIndex}
          onMouseEnter={() => onHover(i)}
          // mousedown (not click) + preventDefault keeps the textarea focused
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(i);
          }}
          className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer text-[13px] transition-colors ${
            i === activeIndex ? 'bg-accent/10' : ''
          }`}
        >
          <span className="shrink-0 whitespace-nowrap rounded bg-ink/[0.05] px-1.5 py-0.5
            font-mono text-[9px] uppercase tracking-[0.16em] text-ink-mute">
            {s.category}
          </span>
          <span className="truncate text-ink-soft">
            <Highlighted text={s.text} ranges={s.ranges} />
          </span>
        </li>
      ))}
    </motion.ul>
  );
}
