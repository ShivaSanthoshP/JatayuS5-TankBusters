# iTOps SRE Copilot — Question Suggestions (Typeahead)

**Date:** 2026-05-21

**Status:** Design — awaiting user review before implementation plan

## Goal

The Copilot chat input (`MessageInput.tsx`) is a bare textarea. New users have
no idea what the Copilot can do, so they either type nothing or ask things it
can't help with.

Add an **inline typeahead**: as the user types, surface the **top 3** matching
questions in a dropdown directly above the textarea. The user can pick one with
the mouse or the keyboard; picking it **fills the textarea** (editable), so they
can adjust a placeholder and then send.

The suggestions are drawn from a **curated bank of ~200 questions** that covers
every capability the Copilot actually has (derived from the chat tool registry).

## Non-goals (explicit decisions)

- **No 1000–2000 hand-written list.** A large list is unmaintainable and mostly
  noise. Quality over quantity: ~200 curated questions + a good fuzzy matcher.
- **No live entities in v1.** Questions use static placeholders like `{node}`;
  they are not expanded against real node/incident names from the backend.
- **No empty-input starter prompts.** Suggestions appear strictly *while typing*,
  per the user's description ("whenever i type something").
- **No LLM-generated suggestions.** No per-keystroke backend call — matching is
  client-side and instant.
- **No new test runner.** The frontend has no test framework; adding one is out
  of scope. Verification is `tsc -b`, `eslint`, and manual.

## Architecture

Five units, each with a single responsibility:

| File | Responsibility |
|---|---|
| `frontend/src/data/copilotQuestions.ts` | The curated bank: `~200` entries of `{ text, category }`, grouped across the 7 capability areas. Some carry placeholders (`{node}`, `{incident}`, `{runbook}`). |
| `frontend/src/lib/fuzzyMatch.ts` | Pure: `fuzzyMatch(query, target) → { score, ranges } \| null`. Case-insensitive subsequence match with word-boundary + contiguity bonuses; `ranges` are the matched char spans for bolding. |
| `frontend/src/hooks/useQuestionSuggestions.ts` | `useQuestionSuggestions(draft) → Suggestion[]`. Runs the matcher over the bank, returns the memoized **top 3**. |
| `frontend/src/components/chat/SuggestionList.tsx` | Presentational dropdown: 3 rows, active-row highlight, bolded matched chars, a small category tag. framer-motion fade/rise. |
| `frontend/src/components/chat/MessageInput.tsx` | Container (existing file): owns `activeIndex`/`open` state, keyboard handling, ARIA combobox wiring, the select→fill behavior. |

### Capability areas covered by the bank

`Fleet & nodes` (~40) · `Incidents` (~30) · `Pipeline / agents` (~30) ·
`Runbooks` (~25) · `Data sources` (~25) · `Simulators` (~25) ·
`Settings & explain` (~25). Categories map to the Copilot's real tools
(`list_nodes`, `get_node_metrics`, `list_incidents`, `run_pipeline`,
`search_runbooks`, `list_data_sources`, `control_simulator`, `update_setting`,
etc.).

## Data flow

```
draft text (MessageInput state)
   → useQuestionSuggestions(draft)
        → fuzzyMatch over copilotQuestions  → ranked top 3 (with ranges)
   → SuggestionList renders 3 rows
keyboard / mouse → MessageInput sets activeIndex
pick → setDraft(question); focus textarea; select first {placeholder} or caret-end
```

## UI

The input is pinned to the bottom of the viewport, so the dropdown opens
**upward**, inside the same centered `max-w-3xl` column as the input.

```
       ╭──────────────────────────────────────────────────╮
       │  ◆ Fleet     Which nodes are CRITical right now?  │ ◄ active
       │  ◆ Fleet     List all CRITical database nodes     │
       │  ◆ Pipeline  Run the pipeline on {node}           │
       ╰──────────────────────────────────────────────────╯
       ╭──────────────────────────────────────────────────╮
       │  crit▌                                      [ ▶ ] │  textarea
       ╰──────────────────────────────────────────────────╯
        ↑↓ or Tab to move  ·  Enter to pick  ·  Esc to dismiss
```

- Matched characters bolded within each question.
- Glass panel consistent with the app's glass tiers; accent-tinted active row.
- 6px gap above the input bar; framer-motion fade + slight rise on open.
- The keyboard hint line is hidden on small (touch) screens.

## Keyboard model

When the dropdown first opens, **no row is highlighted** — so `Enter` still
sends the typed text unchanged. The user presses `↓`/`Tab` to step into the
list. While the dropdown is open, `Tab` is captured to move the highlight
(rather than leaving the field); once it closes — via `Esc` or no matches —
`Tab` behaves normally again. (The ASCII mockup above shows the post-navigation
state, with row 1 active.)

- `↓` / `Tab` — move highlight down (wraps); `↑` / `Shift+Tab` — up.
- `Enter` — if a row is highlighted, **pick it** (fills textarea, does *not*
  send). If no row is highlighted, send the message (unchanged behavior).
- `Esc` — close the dropdown, keep the draft. Typing more re-opens it.
- Mouse hover highlights a row; click picks it.

## On select

The picked question's text replaces the draft. If the text contains a
`{placeholder}`, that token (braces included) is selected in the textarea so the
user's next keystroke replaces it; otherwise the caret goes to the end. The user
edits as needed and presses `Enter` to send.

## Accessibility

Proper ARIA combobox (ui-ux-pro-max priority 1):

- Textarea: `role="combobox"`, `aria-expanded`, `aria-autocomplete="list"`,
  `aria-controls` → list id, `aria-activedescendant` → active row id.
- List: `role="listbox"`; rows: `role="option"` with `aria-selected`.
- Active state shown by background + ring, not color alone.
- `prefers-reduced-motion` respected (existing global CSS rule covers
  transitions/animations; framer-motion usage matches app convention).

## Edge cases

- Draft `< 2` chars or whitespace-only → no dropdown.
- No fuzzy matches → no dropdown (never render an empty box).
- Draft exactly equals a bank entry → suppress (nothing to suggest).
- `disabled` (a message is streaming) → no dropdown.
- `Esc` closes; further typing re-opens.
- Picking does not auto-send — nothing leaves the client without an explicit
  `Enter`/Send press.

## Testing

No frontend test runner exists in this repo. Verification:

- `tsc -b` (typecheck) and `eslint .` clean on all touched files.
- Manual: type a prefix → 3 suggestions appear above the input; arrows/Tab move
  the highlight; Enter on a highlight fills the input (placeholder selected);
  Enter with no highlight sends; Esc dismisses; mouse hover + click work; nothing
  shows under 2 chars / no match / while streaming.

`fuzzyMatch` is a small pure function, kept simple enough to verify by
inspection.
