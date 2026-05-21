# iTOps SRE Copilot — Domain Guardrail + Readable Answers

**Date:** 2026-05-21

**Status:** Design — awaiting user review before implementation plan

## Goal

The SRE Copilot already does text-to-text streaming chat with a function-calling
tool loop. But the orchestrator sends Gemini only the conversation messages plus
tool declarations — `GenerateContentConfig` carries **no `system_instruction`**.
With no persona or scope, the model behaves like general-purpose Gemini and will
answer anything ("who is India's PM?").

Add a **domain guardrail** so the copilot:

1. Answers questions about **this ITOps deployment** (via its tools) **and**
   general **SRE/DevOps/infrastructure** knowledge.
2. **Refuses** anything else (trivia, politics, news, personal advice, non-ops
   coding help) — one-sentence decline + redirect, no partial answer, no tool call.
3. On a **vague** request ("fix it", "what's broken?"), asks **exactly one**
   clarifying question instead of guessing or dumping, then proceeds.

Also make answers readable: render assistant markdown (tables/lists/bold) in the
chat, since tools return structured data (node lists, incidents).

## Non-goals (explicit user decisions)

- No chat sessions, no history/persistence, no long-term/server-side memory.
- No charts/visualization, no suggested follow-up prompts.
- No swap to Google ADK. itops keeps its hand-rolled orchestrator because it has
  a risky-tool confirmation + idempotency safety layer that ADK would force us to
  rewrite and lose.
- The client-side `localStorage` conversation (`itops_chat_v1`) is left untouched
  — it is convenience state, not "memory" in the sense ruled out.

## Reuse rationale (how ariia informs this)

ariia's chat agent (`google.adk` `Agent(instruction=get_system_prompt(), tools=[…])`)
is **prompt-driven end to end**: persona, scope, and refusals all live in the
system prompt — there is no separate classifier. Its Investigation Agent is
"scoped to only answer questions related to the specific case" purely via its
instruction. ariia's keyword `_categorize_query` is only for cache/suggestion
routing, **not** a guardrail.

So ariia's matured guardrail logic *is* "scope the agent via its system prompt,"
which is exactly the chosen mechanism here. We also borrow the **rigor** of
ariia's prompt — sectioned, with explicit answer-quality rules ("synthesize, don't
dump raw rows", "never invent names", "no internal monologue") — but tuned
**stricter** on scope (ariia's is intentionally permissive). The only difference
is mechanical: ADK sets the system instruction for you; itops wires
`system_instruction` into its own `chat_with_tools`.

## High-level approach

Prompt-only guardrail. A new system prompt is passed as Gemini's
`system_instruction` on every model call inside the orchestrator's tool loop, so
the persona and scope hold for the whole turn (not just the first call). Refusals
and clarifying questions come back as ordinary assistant text tokens, so they
stream and render through the existing chat path with no special handling.

## Components

### Backend (new files)

- **`backend/app/chat/prompt.py`** — single module exporting
  `SRE_COPILOT_SYSTEM_PROMPT: str`. Structured sections:
  - **Persona** — the SRE Copilot embedded in this ITOps Orchestrator deployment.
  - **In scope** — (a) this platform's live state/actions via tools: infrastructure
    nodes, metrics, logs, incidents, runbooks, simulators, data pipelines, data
    sources, settings; (b) general SRE/DevOps/infrastructure knowledge.
  - **Out of scope → refuse** — anything unrelated to infra ops or SRE/DevOps.
    Decline in one sentence + remind the user what it can help with. No partial
    answer. No tool call for off-topic input.
  - **Vague → clarify** — if a request is too vague to act on, ask exactly one
    specific clarifying question; once answered, proceed.
  - **Answer quality** — synthesize insights, don't dump raw tool JSON; present
    structured data as markdown tables/lists; no internal monologue ("Let me
    check…"); never invent node names, metrics, incident IDs, or results; never
    claim it performed a mutating action it didn't (risky actions go through the
    existing confirmation flow).

### Backend (modified)

- **`backend/app/llm/provider.py`** — `chat_with_tools(...)` gains an optional
  keyword arg `system_instruction: str | None = None`. When set, add it to
  `GenerateContentConfig(system_instruction=system_instruction, …)`. Default
  `None` keeps the function backward-compatible.

- **`backend/app/chat/orchestrator.py`** — both `run_turn` and
  `run_turn_streaming` gain `system_prompt: str = SRE_COPILOT_SYSTEM_PROMPT`
  (imported from `app.chat.prompt`). Pass `system_instruction=system_prompt` on
  every `_call_gemini` / `call_gemini` invocation (the loop call, the
  tool-ceiling synthesis call, and the streaming-path call). The default param
  lets tests override the prompt.

### Frontend (modified)

- **`frontend/package.json`** — add deps `react-markdown` and `remark-gfm` (same
  libraries ariia uses), then `npm install`.

- **`frontend/src/components/chat/MessageList.tsx`** — render **assistant**
  message `content` with `<ReactMarkdown remarkPlugins={[remarkGfm]}>` using
  styled component overrides for `table`/`th`/`td`/`ul`/`ol`/`li`/`p`/`a`/`code`,
  adapted to itops' dark theme tokens (`ink`, `hairline`, etc.). **User** messages
  stay plain text (the existing `<pre>` path) so user input is never interpreted
  as markdown. Tool-event chips (`ToolEvent`) and `ConfirmCard` rendering are
  unchanged.

## Data flow (unchanged except the system prompt)

```
User msg ─▶ orchestrator.run_turn_streaming
              │  builds tool decls from registry
              │  calls chat_with_tools(messages, tools,
              │       system_instruction=SRE_COPILOT_SYSTEM_PROMPT)  ◀── NEW
              ▼
   ┌─ off-topic ──▶ model returns refusal text ──▶ token events ──▶ bubble
   ├─ vague ──────▶ model returns ONE clarifying question ──▶ token events
   └─ in-scope ───▶ model calls tools (loop) ──▶ tool_started/tool_result
                     ──▶ final markdown answer ──▶ token events ──▶ ReactMarkdown
```

## Testing strategy

### Backend (pytest)

- **New `tests/chat/test_prompt.py`** — contract test on
  `SRE_COPILOT_SYSTEM_PROMPT`: asserts presence of the scope rules (platform +
  SRE), the refuse-off-topic rule, the ask-one-clarifying-question rule, and the
  answer-quality rules (don't fabricate / synthesize-don't-dump).
- **New `tests/chat/test_guardrail.py`** — spy on the LLM caller and assert
  `system_instruction` equals the guardrail prompt for **both** paths:
  - non-streaming: patch `app.chat.orchestrator._call_gemini`, capture kwargs,
    run `run_turn`, assert `system_instruction` was passed.
  - streaming: pass a `gemini_caller` spy to `run_turn_streaming`, assert the same.
- Existing suite stays green: current fakes use `lambda **_:` and `return_value=`,
  so the new `system_instruction` kwarg is tolerated.

### Frontend

- Manual verification (no vitest harness present in this project): assistant
  answers containing a markdown table render as a styled table; user messages
  with `|` characters render literally (not as a table); tool chips and confirm
  cards still render.

## Manual test checklist (for use during implementation)

- [ ] Ask "who is India's PM?" → one-sentence refusal + redirect, no tool call.
- [ ] Ask "tell me a joke" → refusal.
- [ ] Ask "what does OOMKilled mean?" → answered (general SRE knowledge).
- [ ] Ask "show me the critical nodes" → tool call + markdown table renders.
- [ ] Ask "fix it" → one clarifying question (e.g. "Which node or incident?").
- [ ] Risky action (e.g. "delete runbook X") → ConfirmCard still appears (safety
      flow intact); copilot does not claim it acted before confirmation.
- [ ] Existing backend chat tests pass: `pytest backend/tests/chat`.

## Risks & mitigations

- **Soft guardrail (prompt can be coaxed).** Accepted trade-off for "keep it
  simple." Clear, sectioned instructions + Gemini Flash follow scoping reliably.
  If stricter enforcement is needed later, a deterministic pre-classifier can be
  added without changing this design (it would short-circuit before the loop).
- **Markdown XSS via model output.** `react-markdown` does not render raw HTML by
  default (no `rehype-raw`), so model text is safe to render. Links open with
  `rel="noopener noreferrer"`.
- **Prompt drift vs tools.** The in-scope capability list in the prompt is static
  prose; if tools are added/removed it can go stale. Low risk — kept as broad
  capability areas, not an exhaustive tool list.
