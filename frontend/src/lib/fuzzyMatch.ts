// Pure, dependency-free fuzzy matcher for the question typeahead.

export interface FuzzyResult {
  /** Higher is a better match. */
  score: number;
  /** Matched character spans in the target as [start, end) pairs, for bolding. */
  ranges: Array<[number, number]>;
}

/**
 * Case-insensitive subsequence match: every character of `query` must appear in
 * `target` in order. Returns null when it does not. Score rewards matches at
 * word starts, contiguous runs, and an early first hit; it lightly penalises
 * gaps and longer targets so tighter, shorter matches rank higher.
 */
export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const t = target.toLowerCase();
  if (q.length > t.length) return null;

  const ranges: Array<[number, number]> = [];
  let score = 0;
  let qi = 0;
  let runStart = -1;
  let prevMatch = -2;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;

    const atWordStart = ti === 0 || !/[a-z0-9]/.test(t[ti - 1]);
    if (atWordStart) score += 8;

    if (ti === prevMatch + 1) {
      score += 6; // contiguous with the previous match
    } else {
      score -= Math.min(3, ti - prevMatch - 1); // small gap penalty
    }

    if (qi === 0) score += Math.max(0, 12 - ti); // earliness of first hit

    if (runStart === -1) {
      runStart = ti;
    } else if (ti !== prevMatch + 1) {
      ranges.push([runStart, prevMatch + 1]);
      runStart = ti;
    }
    prevMatch = ti;
    qi++;
  }

  if (qi < q.length) return null; // ran out of target before matching all of query
  ranges.push([runStart, prevMatch + 1]);

  score -= t.length * 0.05; // prefer shorter targets when otherwise tied
  return { score, ranges };
}
