# Copilot Question Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inline typeahead to the Copilot chat input that, as the user types, surfaces the top 3 matching questions from a curated bank and fills the input with the picked one.

**Architecture:** A static curated question bank (`copilotQuestions.ts`) is matched client-side by a pure fuzzy matcher (`fuzzyMatch.ts`). A hook (`useQuestionSuggestions.ts`) ranks the bank and returns the top 3. A presentational dropdown (`SuggestionList.tsx`) renders them above the input. `MessageInput.tsx` owns the state, keyboard handling, ARIA combobox wiring, and the select→fill behavior. No backend, no test runner involved.

**Tech Stack:** React 18 + TypeScript, Vite, framer-motion, Tailwind, lucide-react. All work is under `frontend/`.

---

## Conventions for every task

- All commands run from `frontend/` (i.e. `cd /home/shiva/itops/frontend` first).
- **Typecheck:** `npx tsc --noEmit` — expected: no output (clean).
- **Lint:** `npx eslint <files>` — expected: no output (clean). Pre-existing
  warnings in files you did not create are out of scope; do not fix them.
- This repo has **no frontend test runner** (no vitest/jest). There are no unit
  tests to write. Correctness is verified by typecheck, lint, and the manual
  smoke in Task 6. `fuzzyMatch` is a small pure function — verify it by
  inspection.
- **Never run `git push`.** Commit messages must not contain a `Co-Authored-By`
  trailer.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `frontend/src/data/copilotQuestions.ts` | Create | The curated question bank + types. Pure data. |
| `frontend/src/lib/fuzzyMatch.ts` | Create | Pure fuzzy match function returning score + match ranges. |
| `frontend/src/hooks/useQuestionSuggestions.ts` | Create | Hook: ranks the bank against the draft, returns top 3. |
| `frontend/src/components/chat/SuggestionList.tsx` | Create | Presentational dropdown of 3 suggestion rows. |
| `frontend/src/components/chat/MessageInput.tsx` | Modify | Container: state, keyboard, ARIA, select→fill. |

`src/data/` does not exist yet — creating the first file in it creates the directory.

---

### Task 1: Curated question bank

**Files:**
- Create: `frontend/src/data/copilotQuestions.ts`

- [ ] **Step 1: Create the question bank file**

Create `frontend/src/data/copilotQuestions.ts` with exactly this content:

```ts
// Curated question bank for the Copilot input typeahead. Each entry maps to a
// real Copilot capability (see backend/app/chat/tools/*). Placeholders in
// {braces} are filled in by the user after the question is picked.

export type QuestionCategory =
  | 'Fleet'
  | 'Incidents'
  | 'Pipeline'
  | 'Runbooks'
  | 'Data sources'
  | 'Simulators'
  | 'Settings';

export interface BankQuestion {
  text: string;
  category: QuestionCategory;
}

export const COPILOT_QUESTIONS: BankQuestion[] = [
  // ── Fleet & nodes ──────────────────────────────────────────────
  { text: 'Which nodes are critical right now?', category: 'Fleet' },
  { text: 'Show me all degraded nodes', category: 'Fleet' },
  { text: 'List every healthy node', category: 'Fleet' },
  { text: 'How many nodes are in the fleet?', category: 'Fleet' },
  { text: 'Give me a fleet health overview', category: 'Fleet' },
  { text: "What's the overall status of the fleet?", category: 'Fleet' },
  { text: 'Show CPU and memory for {node}', category: 'Fleet' },
  { text: 'What are the current metrics for {node}?', category: 'Fleet' },
  { text: 'Show me the latest logs for {node}', category: 'Fleet' },
  { text: 'Why is {node} unhealthy?', category: 'Fleet' },
  { text: 'Is {node} healthy right now?', category: 'Fleet' },
  { text: 'List all database nodes', category: 'Fleet' },
  { text: 'List all server nodes', category: 'Fleet' },
  { text: 'List all cache nodes', category: 'Fleet' },
  { text: 'List all load balancer nodes', category: 'Fleet' },
  { text: 'List all queue nodes', category: 'Fleet' },
  { text: 'Which nodes have the highest CPU?', category: 'Fleet' },
  { text: 'Which nodes have the highest memory usage?', category: 'Fleet' },
  { text: 'Which node has the worst latency?', category: 'Fleet' },
  { text: 'Show me nodes with a high error rate', category: 'Fleet' },
  { text: 'Show details for node {node}', category: 'Fleet' },
  { text: 'What region is {node} in?', category: 'Fleet' },
  { text: 'List nodes by region', category: 'Fleet' },
  { text: 'How many critical nodes are there?', category: 'Fleet' },
  { text: 'Summarize the health of every node', category: 'Fleet' },
  { text: 'Show me the dashboard overview', category: 'Fleet' },
  { text: "What's the average CPU across the fleet?", category: 'Fleet' },
  { text: "What's the average memory across the fleet?", category: 'Fleet' },
  { text: 'Which nodes need attention?', category: 'Fleet' },
  { text: 'Show recent log lines for {node}', category: 'Fleet' },
  { text: 'Are any nodes offline?', category: 'Fleet' },
  { text: 'List all nodes from the AWS data source', category: 'Fleet' },
  { text: 'List all simulated nodes', category: 'Fleet' },
  { text: 'What type of node is {node}?', category: 'Fleet' },

  // ── Incidents ──────────────────────────────────────────────────
  { text: 'List all open incidents', category: 'Incidents' },
  { text: 'Show me the latest incident', category: 'Incidents' },
  { text: 'How many incidents are open?', category: 'Incidents' },
  { text: 'How many incidents were resolved today?', category: 'Incidents' },
  { text: 'Show details for incident {incident}', category: 'Incidents' },
  { text: "What's the root cause of incident {incident}?", category: 'Incidents' },
  { text: 'Which incidents are still unresolved?', category: 'Incidents' },
  { text: 'Show me critical incidents', category: 'Incidents' },
  { text: 'List incidents for {node}', category: 'Incidents' },
  { text: 'What incident is affecting {node}?', category: 'Incidents' },
  { text: "What's our MTTR right now?", category: 'Incidents' },
  { text: 'How long did incident {incident} take to resolve?', category: 'Incidents' },
  { text: 'Show the most recent resolved incident', category: 'Incidents' },
  { text: 'What incidents happened in the last hour?', category: 'Incidents' },
  { text: "Summarize today's incidents", category: 'Incidents' },
  { text: 'Walk me through incident {incident}', category: 'Incidents' },
  { text: 'What remediation was applied to incident {incident}?', category: 'Incidents' },
  { text: 'List incidents by severity', category: 'Incidents' },
  { text: 'How many incidents has the fleet had in total?', category: 'Incidents' },
  { text: 'Which node has the most incidents?', category: 'Incidents' },
  { text: 'Show me the oldest open incident', category: 'Incidents' },
  { text: "What's the status of incident {incident}?", category: 'Incidents' },
  { text: 'Give me an incident summary for the fleet', category: 'Incidents' },
  { text: 'Were any incidents resolved automatically?', category: 'Incidents' },
  { text: "What's the timeline of incident {incident}?", category: 'Incidents' },
  { text: 'Did incident {incident} pass or fail remediation?', category: 'Incidents' },
  { text: 'Are there any incidents I should worry about?', category: 'Incidents' },
  { text: 'Show open incidents for database nodes', category: 'Incidents' },

  // ── Pipeline / agents ──────────────────────────────────────────
  { text: 'Run the pipeline on {node}', category: 'Pipeline' },
  { text: 'Run the full remediation pipeline on {node}', category: 'Pipeline' },
  { text: 'Run the pipeline on all critical nodes', category: 'Pipeline' },
  { text: 'Run a batch pipeline across the degraded nodes', category: 'Pipeline' },
  { text: 'Show me recent pipeline runs', category: 'Pipeline' },
  { text: 'What did the last pipeline run do?', category: 'Pipeline' },
  { text: "What's the status of pipeline run {run}?", category: 'Pipeline' },
  { text: 'How does the autonomous pipeline work?', category: 'Pipeline' },
  { text: 'What are the five agents in the pipeline?', category: 'Pipeline' },
  { text: 'What does the monitoring agent do?', category: 'Pipeline' },
  { text: 'What does the predictive agent do?', category: 'Pipeline' },
  { text: 'What does the diagnostic agent do?', category: 'Pipeline' },
  { text: 'What does the remediation agent do?', category: 'Pipeline' },
  { text: 'What does the reporting agent do?', category: 'Pipeline' },
  { text: 'Diagnose {node} for me', category: 'Pipeline' },
  { text: 'Predict the risk for {node}', category: 'Pipeline' },
  { text: 'Generate a fix for {node}', category: 'Pipeline' },
  { text: 'Why did pipeline run {run} fail?', category: 'Pipeline' },
  { text: 'Show the progress of the current pipeline run', category: 'Pipeline' },
  { text: 'Is the pipeline running right now?', category: 'Pipeline' },
  { text: 'How many remediations have the agents executed?', category: 'Pipeline' },
  { text: "What's the auto-fix success rate?", category: 'Pipeline' },
  { text: 'Run diagnosis and remediation on {node}', category: 'Pipeline' },
  { text: 'Show me the last 10 pipeline runs', category: 'Pipeline' },
  { text: 'Did the last remediation succeed?', category: 'Pipeline' },
  { text: 'Run the pipeline on {node} and explain each step', category: 'Pipeline' },
  { text: 'What happens when an anomaly is detected?', category: 'Pipeline' },
  { text: 'Trigger remediation for the critical nodes', category: 'Pipeline' },

  // ── Runbooks ───────────────────────────────────────────────────
  { text: 'List all runbooks', category: 'Runbooks' },
  { text: 'Search runbooks for high memory', category: 'Runbooks' },
  { text: 'Search runbooks for high CPU', category: 'Runbooks' },
  { text: 'Search runbooks for disk pressure', category: 'Runbooks' },
  { text: 'Search runbooks for network latency', category: 'Runbooks' },
  { text: 'Find a runbook for the issue on {node}', category: 'Runbooks' },
  { text: 'Show me runbook {runbook}', category: 'Runbooks' },
  { text: 'How many runbooks do we have?', category: 'Runbooks' },
  { text: 'What runbook applies to a database outage?', category: 'Runbooks' },
  { text: 'Is there a runbook for high error rates?', category: 'Runbooks' },
  { text: 'Search runbooks for restart procedures', category: 'Runbooks' },
  { text: 'Show the most recent runbook', category: 'Runbooks' },
  { text: 'Delete runbook {runbook}', category: 'Runbooks' },
  { text: "What's in runbook {runbook}?", category: 'Runbooks' },
  { text: 'Find runbooks related to incident {incident}', category: 'Runbooks' },
  { text: 'Search runbooks for memory leaks', category: 'Runbooks' },
  { text: 'Search runbooks for service crashes', category: 'Runbooks' },
  { text: 'Do we have a runbook for scaling up?', category: 'Runbooks' },
  { text: 'List runbooks created from resolved incidents', category: 'Runbooks' },
  { text: 'Search runbooks for connection errors', category: 'Runbooks' },
  { text: 'Which runbook fixes high latency?', category: 'Runbooks' },
  { text: 'Summarize runbook {runbook}', category: 'Runbooks' },
  { text: 'Find a runbook for CPU saturation', category: 'Runbooks' },
  { text: 'Search runbooks for cache eviction', category: 'Runbooks' },

  // ── Data sources ───────────────────────────────────────────────
  { text: 'List all data sources', category: 'Data sources' },
  { text: 'What data sources are connected?', category: 'Data sources' },
  { text: 'Test the connection to the AWS data source', category: 'Data sources' },
  { text: 'Test the connection to {datasource}', category: 'Data sources' },
  { text: 'Reconnect the simulated data source', category: 'Data sources' },
  { text: 'Reconnect {datasource}', category: 'Data sources' },
  { text: 'Disconnect the AWS data source', category: 'Data sources' },
  { text: 'Disconnect {datasource}', category: 'Data sources' },
  { text: 'Is the AWS data source healthy?', category: 'Data sources' },
  { text: 'Why is {datasource} disconnected?', category: 'Data sources' },
  { text: 'Show me the status of every data source', category: 'Data sources' },
  { text: 'How many data sources do we have?', category: 'Data sources' },
  { text: 'Which data sources are simulated?', category: 'Data sources' },
  { text: 'Which data sources are real?', category: 'Data sources' },
  { text: 'Check if {datasource} is reachable', category: 'Data sources' },
  { text: 'Reconnect any failed data sources', category: 'Data sources' },
  { text: 'What nodes come from the AWS data source?', category: 'Data sources' },
  { text: 'Is the connection to {datasource} working?', category: 'Data sources' },
  { text: 'Troubleshoot the {datasource} connection', category: 'Data sources' },
  { text: 'Show data source connection errors', category: 'Data sources' },
  { text: 'List data sources by type', category: 'Data sources' },
  { text: 'Refresh the {datasource} connection', category: 'Data sources' },
  { text: 'Are all data sources online?', category: 'Data sources' },
  { text: 'Test every data source connection', category: 'Data sources' },

  // ── Simulators ─────────────────────────────────────────────────
  { text: 'List all simulators', category: 'Simulators' },
  { text: 'What simulators are running?', category: 'Simulators' },
  { text: 'Pause the {simulator} simulator', category: 'Simulators' },
  { text: 'Resume the {simulator} simulator', category: 'Simulators' },
  { text: 'Stop the {simulator} simulator', category: 'Simulators' },
  { text: 'Restart the {simulator} simulator', category: 'Simulators' },
  { text: 'Delete the {simulator} simulator', category: 'Simulators' },
  { text: 'How many simulators are active?', category: 'Simulators' },
  { text: 'Make {simulator} simulate high CPU', category: 'Simulators' },
  { text: 'Make {simulator} simulate a memory spike', category: 'Simulators' },
  { text: 'Make {simulator} simulate an outage', category: 'Simulators' },
  { text: 'Inject a fault into {simulator}', category: 'Simulators' },
  { text: 'Which simulators are paused?', category: 'Simulators' },
  { text: 'Show me the status of {simulator}', category: 'Simulators' },
  { text: 'Pause all simulators', category: 'Simulators' },
  { text: 'Resume all simulators', category: 'Simulators' },
  { text: 'What is {simulator} currently doing?', category: 'Simulators' },
  { text: 'Make {simulator} healthy again', category: 'Simulators' },
  { text: 'Trigger an anomaly on {simulator}', category: 'Simulators' },
  { text: 'List simulators by node type', category: 'Simulators' },
  { text: 'Stop every running simulator', category: 'Simulators' },
  { text: 'What scenario is {simulator} running?', category: 'Simulators' },
  { text: 'Make {simulator} simulate high latency', category: 'Simulators' },
  { text: 'Is the {simulator} simulator running?', category: 'Simulators' },

  // ── Settings & explain ─────────────────────────────────────────
  { text: 'Show me the current settings', category: 'Settings' },
  { text: 'What model is the remediation agent using?', category: 'Settings' },
  { text: 'What LLM provider are we using?', category: 'Settings' },
  { text: 'Switch the LLM provider to Gemini', category: 'Settings' },
  { text: 'Switch the LLM provider to Ollama', category: 'Settings' },
  { text: 'Set the diagnostic agent temperature to 0.3', category: 'Settings' },
  { text: 'Set the remediation agent temperature to 0.2', category: 'Settings' },
  { text: 'Lower the monitoring agent temperature', category: 'Settings' },
  { text: 'What are all the agent temperatures?', category: 'Settings' },
  { text: 'Change the online model to gemini-2.5-flash', category: 'Settings' },
  { text: 'What embedding provider is configured?', category: 'Settings' },
  { text: 'Switch the embedding provider to Ollama', category: 'Settings' },
  { text: 'Enable auto-run for the pipeline', category: 'Settings' },
  { text: 'Disable auto-run for the pipeline', category: 'Settings' },
  { text: 'Set the auto-run interval to 60 seconds', category: 'Settings' },
  { text: "What's the fallback model?", category: 'Settings' },
  { text: 'What can you do?', category: 'Settings' },
  { text: 'What can I ask you?', category: 'Settings' },
  { text: 'Explain how this platform works', category: 'Settings' },
  { text: 'What is MTTR?', category: 'Settings' },
  { text: 'What does the auto-fix rate mean?', category: 'Settings' },
  { text: 'How does the vector store work?', category: 'Settings' },
  { text: 'What is a runbook?', category: 'Settings' },
  { text: 'Help me get started', category: 'Settings' },
];
```

- [ ] **Step 2: Typecheck**

Run: `cd /home/shiva/itops/frontend && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Lint**

Run: `npx eslint src/data/copilotQuestions.ts`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /home/shiva/itops
git add frontend/src/data/copilotQuestions.ts
git commit -m "feat(chat): add curated question bank for copilot suggestions"
```

---

### Task 2: Fuzzy matcher

**Files:**
- Create: `frontend/src/lib/fuzzyMatch.ts`

- [ ] **Step 1: Create the fuzzy matcher**

Create `frontend/src/lib/fuzzyMatch.ts` with exactly this content:

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `cd /home/shiva/itops/frontend && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Lint**

Run: `npx eslint src/lib/fuzzyMatch.ts`
Expected: no output.

- [ ] **Step 4: Verify logic by inspection**

Confirm by reading the code:
- `fuzzyMatch('crit', 'Which nodes are critical right now?')` → matches the
  contiguous `crit` inside `critical`, returns one range, non-null.
- `fuzzyMatch('xyz', 'List all runbooks')` → `x` never matches → returns `null`.
- `fuzzyMatch('', 'anything')` → empty query → returns `null`.
No code change in this step.

- [ ] **Step 5: Commit**

```bash
cd /home/shiva/itops
git add frontend/src/lib/fuzzyMatch.ts
git commit -m "feat(chat): add fuzzy matcher for question suggestions"
```

---

### Task 3: Suggestions hook

**Files:**
- Create: `frontend/src/hooks/useQuestionSuggestions.ts`

- [ ] **Step 1: Create the hook**

Create `frontend/src/hooks/useQuestionSuggestions.ts` with exactly this content:

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `cd /home/shiva/itops/frontend && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Lint**

Run: `npx eslint src/hooks/useQuestionSuggestions.ts`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /home/shiva/itops
git add frontend/src/hooks/useQuestionSuggestions.ts
git commit -m "feat(chat): add useQuestionSuggestions hook"
```

---

### Task 4: SuggestionList dropdown component

**Files:**
- Create: `frontend/src/components/chat/SuggestionList.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/chat/SuggestionList.tsx` with exactly this content:

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run: `cd /home/shiva/itops/frontend && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Lint**

Run: `npx eslint src/components/chat/SuggestionList.tsx`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /home/shiva/itops
git add frontend/src/components/chat/SuggestionList.tsx
git commit -m "feat(chat): add SuggestionList dropdown component"
```

---

### Task 5: Wire the typeahead into MessageInput

**Files:**
- Modify: `frontend/src/components/chat/MessageInput.tsx` (full rewrite)

- [ ] **Step 1: Replace MessageInput with the typeahead-enabled version**

Overwrite `frontend/src/components/chat/MessageInput.tsx` with exactly this content:

```tsx
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
          placeholder="Ask the copilot…"
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
```

- [ ] **Step 2: Typecheck**

Run: `cd /home/shiva/itops/frontend && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Lint**

Run: `npx eslint src/components/chat/MessageInput.tsx`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /home/shiva/itops
git add frontend/src/components/chat/MessageInput.tsx
git commit -m "feat(chat): wire question typeahead into the chat input"
```

---

### Task 6: Full verification & manual smoke

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `cd /home/shiva/itops/frontend && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 2: Full lint of all touched files**

Run: `npx eslint src/data/copilotQuestions.ts src/lib/fuzzyMatch.ts src/hooks/useQuestionSuggestions.ts src/components/chat/SuggestionList.tsx src/components/chat/MessageInput.tsx`
Expected: no output.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 4: Manual smoke (dev server)**

Run `npm run dev`, open the app, go to the Copilot tab, and confirm:
- Typing `crit` shows up to 3 suggestions in a panel **above** the input, with
  the matched letters bolded.
- `↓` / `↑` move the highlight; `Tab` / `Shift+Tab` also move it and wrap; the
  highlight does not leave the field while the dropdown is open.
- `Enter` with **no** highlight sends the typed text; `Enter` **on** a highlight
  fills the textarea instead of sending.
- Picking `Run the pipeline on {node}` selects the `{node}` token so typing
  replaces it.
- Mouse hover highlights a row; clicking a row fills the input and keeps focus.
- `Esc` closes the dropdown; typing another character reopens it.
- Nothing shows for a 1-character draft, for a no-match draft (e.g. `zzzz`), or
  while a message is streaming.

- [ ] **Step 5: Fix any issues found**

If the smoke test surfaces a problem, fix it in the relevant file, re-run
Steps 1–3, and commit with a `fix(chat):` message describing the fix.

---

## Self-review notes

- **Spec coverage:** bank → Task 1; `fuzzyMatch` → Task 2; `useQuestionSuggestions`
  (top 3, min 2 chars, exact-match suppression) → Task 3; `SuggestionList`
  (upward dropdown, bolded matches, category tag, framer-motion) → Task 4;
  keyboard model, ARIA combobox, select→fill with placeholder selection,
  edge cases (disabled, no-match, <2 chars, Esc) → Task 5; verification → Task 6.
  No spec section is unaddressed.
- **Types:** `BankQuestion` / `QuestionCategory` (Task 1) consumed unchanged by
  Task 3; `FuzzyResult` (Task 2) consumed by Task 3; `Suggestion` (Task 3)
  consumed by Tasks 4 and 5. `SuggestionListProps` matches the props passed in
  Task 5 (`suggestions`, `activeIndex`, `listId`, `optionId`, `onHover`,
  `onPick`). `MessageInput`'s public props (`onSend`, `disabled`) are unchanged,
  so `Copilot.tsx` needs no edit.
- **No placeholders:** every file is given in full; the only `{braces}` are
  intentional question-bank placeholders, documented in Task 1 and handled in
  Task 5's `pick`.
