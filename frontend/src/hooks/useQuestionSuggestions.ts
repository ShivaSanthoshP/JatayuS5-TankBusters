import { useMemo } from 'react';
import { COPILOT_QUESTIONS, type QuestionCategory } from '../data/copilotQuestions';
import { fuzzyMatch } from '../lib/fuzzyMatch';

export interface Suggestion {
  text: string;
  category: QuestionCategory;
  /** Matched character spans, for bolding in the UI. */
  ranges: Array<[number, number]>;
}

const MIN_CHARS = 2;
const MAX_RESULTS = 3;

/**
 * Ranks the curated question bank against the current draft and returns the
 * top 3 suggestions. Returns an empty array when the draft is too short or
 * exactly equals a bank entry (nothing left to suggest).
 */
export function useQuestionSuggestions(draft: string): Suggestion[] {
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  return useMemo(() => {
    const q = draft.trim();
    if (q.length < MIN_CHARS) return [];
    const lower = q.toLowerCase();

    const scored: Array<{ suggestion: Suggestion; score: number }> = [];
    for (const item of COPILOT_QUESTIONS) {
      if (item.text.toLowerCase() === lower) return []; // exact match — suppress
      const match = fuzzyMatch(q, item.text);
      if (match) {
        scored.push({
          suggestion: { text: item.text, category: item.category, ranges: match.ranges },
          score: match.score,
        });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_RESULTS).map((x) => x.suggestion);
  }, [draft]);
}
