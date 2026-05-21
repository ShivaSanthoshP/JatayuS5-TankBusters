# SRE Copilot Domain Guardrail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope the SRE Copilot to ITOps/SRE topics — answer platform + general SRE/DevOps questions, refuse everything else, ask one clarifying question when vague — and render assistant answers as markdown.

**Architecture:** Prompt-only guardrail. A new `SRE_COPILOT_SYSTEM_PROMPT` is passed as Gemini's `system_instruction` on every model call inside the existing orchestrator tool loop (today that config field is unused). Refusals/clarifications come back as ordinary assistant text and stream through the existing path. The frontend renders assistant text with `react-markdown` so structured answers (node/incident tables) read cleanly. No sessions, memory, charts, or suggestions.

**Tech Stack:** Python 3.12, FastAPI, `google-genai` (Gemini), pytest (backend); React 19, Vite, TypeScript, Tailwind, `react-markdown` + `remark-gfm` (frontend).

---

## Spec

`docs/superpowers/specs/2026-05-21-sre-copilot-guardrail-design.md`

## File structure

- **Create** `backend/app/chat/prompt.py` — the single `SRE_COPILOT_SYSTEM_PROMPT` constant. One responsibility: the guardrail/persona text.
- **Modify** `backend/app/llm/provider.py` — add optional `system_instruction` to `chat_with_tools`.
- **Modify** `backend/app/chat/orchestrator.py` — forward the prompt as `system_instruction` on every Gemini call in both `run_turn` and `run_turn_streaming`.
- **Create** `backend/tests/chat/test_prompt.py` — contract test on the prompt text.
- **Create** `backend/tests/chat/test_guardrail.py` — assert the prompt is wired into the Gemini call in both paths.
- **Modify** `frontend/package.json` — add `react-markdown`, `remark-gfm`.
- **Modify** `frontend/src/components/chat/MessageList.tsx` — render assistant content as markdown.

---

### Task 1: System prompt module + contract test

**Files:**
- Create: `backend/app/chat/prompt.py`
- Test: `backend/tests/chat/test_prompt.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/chat/test_prompt.py`:

```python
"""Contract test: the guardrail prompt must carry the scope, refusal,
clarification, and answer-quality rules the copilot depends on."""

from app.chat.prompt import SRE_COPILOT_SYSTEM_PROMPT


def test_prompt_is_nonempty_string():
    assert isinstance(SRE_COPILOT_SYSTEM_PROMPT, str)
    assert len(SRE_COPILOT_SYSTEM_PROMPT) > 200


def test_prompt_defines_persona_and_scope():
    p = SRE_COPILOT_SYSTEM_PROMPT.lower()
    assert "sre copilot" in p
    # In scope: this platform's operational surfaces + general SRE/DevOps.
    assert "incident" in p
    assert "runbook" in p
    assert "devops" in p
    assert "infrastructure" in p


def test_prompt_refuses_out_of_scope():
    p = SRE_COPILOT_SYSTEM_PROMPT.lower()
    assert "out of scope" in p
    assert "decline" in p          # one-sentence refusal
    assert "do not call any tool" in p


def test_prompt_asks_one_clarifying_question_when_vague():
    p = SRE_COPILOT_SYSTEM_PROMPT.lower()
    assert "vague" in p
    assert "clarifying question" in p


def test_prompt_has_answer_quality_rules():
    p = SRE_COPILOT_SYSTEM_PROMPT.lower()
    assert "never invent" in p     # don't fabricate platform facts
    assert "markdown" in p         # format structured data as markdown
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/chat/test_prompt.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.chat.prompt'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/chat/prompt.py`:

```python
from __future__ import annotations
"""System prompt for the SRE Copilot.

This is the copilot's only guardrail: it scopes the assistant to this ITOps
deployment and general SRE/DevOps knowledge, refuses everything else, and asks
one clarifying question when a request is too vague. It is passed to Gemini as
`system_instruction` on every call in the orchestrator's tool loop.
"""

SRE_COPILOT_SYSTEM_PROMPT = """\
You are the SRE Copilot for this ITOps Orchestrator deployment — an autonomous
AIOps platform that monitors, diagnoses, and remediates infrastructure. You assist
an on-call engineer through a chat interface backed by tools.

=====================================================================
SCOPE — WHAT YOU HELP WITH
=====================================================================
You answer two kinds of questions, and ONLY these two:

1. THIS PLATFORM'S OPERATIONS — anything about this deployment's live state or
   actions, which you reach through your tools: infrastructure nodes and their
   health, metrics, logs, incidents, runbooks, simulators, data pipelines, data
   sources, and platform settings. For these, call the appropriate tool — do not
   answer from memory.

2. GENERAL SRE / DevOps / INFRASTRUCTURE KNOWLEDGE — concepts, error meanings,
   troubleshooting approaches, and best practices across site reliability,
   operations, observability, cloud, networking, containers, databases, and CI/CD.
   Answer these directly from your knowledge; no tool is needed.

=====================================================================
OUT OF SCOPE — REFUSE
=====================================================================
Everything else is out of scope: general trivia, current events, politics, people
or celebrities, entertainment, personal advice, math or homework, and coding help
unrelated to operating infrastructure. For an out-of-scope question:
- Decline in ONE sentence and remind the user what you can help with.
- Do NOT answer it, even partially. Do NOT call any tool for it.
Example: "I'm the SRE Copilot for this ITOps platform, so I can only help with
infrastructure, incidents, runbooks, and SRE topics — I can't help with that one."

=====================================================================
VAGUE REQUESTS — ASK ONE CLARIFYING QUESTION
=====================================================================
If an in-scope request is too vague to act on (for example "fix it", "what's
broken?", or "check the thing"), ask EXACTLY ONE specific clarifying question
instead of guessing or dumping everything. Example: "Which node or incident do
you mean?" Once the user answers, proceed.

=====================================================================
HOW TO ANSWER
=====================================================================
- Use tools for any claim about this platform's live state. NEVER invent node
  names, metrics, incident IDs, runbook contents, or tool results.
- Synthesize insights from tool results — do not dump raw JSON or every row. Lead
  with a one-line summary, then the relevant details.
- Format structured data as Markdown: tables for lists of nodes or incidents,
  bullet lists for steps, and bold for emphasis. Pick the most useful columns, not
  all of them.
- Be concise and practical. No internal monologue ("Let me check...", "I will
  query..."); just give the answer.
- Mutating or risky actions are shown to the user as a confirmation card before
  anything runs. NEVER claim you performed an action you have not actually
  completed.
"""
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/chat/test_prompt.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/chat/prompt.py backend/tests/chat/test_prompt.py
git commit -m "feat(chat): add SRE Copilot guardrail system prompt"
```

---

### Task 2: Thread `system_instruction` through the LLM provider

**Files:**
- Modify: `backend/app/llm/provider.py:276-336`
- Test: `backend/tests/chat/test_guardrail.py` (created in Task 3; this task is verified via Task 1's suite staying green + Task 3)

- [ ] **Step 1: Add the parameter to the signature**

In `backend/app/llm/provider.py`, change the `chat_with_tools` signature. Current (around line 276):

```python
def chat_with_tools(
    *,
    messages: list[dict],          # [{"role": "user"|"assistant", "content": "..."}]
    tools: list[ToolDecl],
    model: str,
    api_key: str,
    temperature: float = 0.0,
    tool_results: list[dict] | None = None,  # [{"name","args","result"}]
) -> ChatWithToolsResponse:
```

Add `system_instruction`:

```python
def chat_with_tools(
    *,
    messages: list[dict],          # [{"role": "user"|"assistant", "content": "..."}]
    tools: list[ToolDecl],
    model: str,
    api_key: str,
    temperature: float = 0.0,
    tool_results: list[dict] | None = None,  # [{"name","args","result"}]
    system_instruction: str | None = None,
) -> ChatWithToolsResponse:
```

- [ ] **Step 2: Pass it into the request config**

In the same function, find where `config_kwargs` is built (around line 302):

```python
    config_kwargs: dict = {"temperature": temperature}
    if function_decls:
        config_kwargs["tools"] = [gt.Tool(function_declarations=function_decls)]
```

Add the system instruction right after that block:

```python
    config_kwargs: dict = {"temperature": temperature}
    if function_decls:
        config_kwargs["tools"] = [gt.Tool(function_declarations=function_decls)]
    if system_instruction:
        config_kwargs["system_instruction"] = system_instruction
```

(No other change needed — `config_kwargs` is already spread into
`gt.GenerateContentConfig(**config_kwargs)` at the call.)

- [ ] **Step 3: Verify nothing regressed**

Run: `cd backend && python -m pytest tests/chat -q`
Expected: PASS — same count as before this task (the new optional kwarg defaults to `None`, so existing callers are unaffected).

- [ ] **Step 4: Commit**

```bash
git add backend/app/llm/provider.py
git commit -m "feat(llm): support system_instruction in chat_with_tools"
```

---

### Task 3: Forward the prompt through the orchestrator (both paths) + wiring test

**Files:**
- Modify: `backend/app/chat/orchestrator.py:65-110` (`run_turn`) and `:137-168` (`run_turn_streaming`)
- Test: `backend/tests/chat/test_guardrail.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/chat/test_guardrail.py`:

```python
"""The guardrail prompt must be wired into the Gemini call as
`system_instruction` in BOTH the non-streaming and streaming paths."""

import asyncio
from unittest.mock import MagicMock, patch

from app.chat.orchestrator import run_turn, run_turn_streaming
from app.chat.prompt import SRE_COPILOT_SYSTEM_PROMPT
from app.chat.registry import ToolRegistry
from app.chat.confirm_store import ConfirmStore
from app.database.session import SessionLocal, init_db
from app.llm.provider import ChatWithToolsResponse


def test_run_turn_passes_system_instruction():
    init_db()
    reg = ToolRegistry()  # empty registry: model returns text, loop exits at once
    fake = MagicMock(return_value=ChatWithToolsResponse(text="ok"))
    with patch("app.chat.orchestrator._call_gemini", fake):
        with SessionLocal() as db:
            run_turn(
                messages=[{"role": "user", "content": "hi"}],
                registry=reg, db=db, session_id="s1", conversation_id="c1",
                api_key="fake",
            )
    assert fake.call_args.kwargs["system_instruction"] == SRE_COPILOT_SYSTEM_PROMPT


def test_run_turn_streaming_passes_system_instruction():
    init_db()
    reg = ToolRegistry()
    confirm_store = ConfirmStore()
    spy = MagicMock(return_value=ChatWithToolsResponse(text="ok"))

    async def drain():
        async for _ in run_turn_streaming(
            messages=[{"role": "user", "content": "hi"}],
            registry=reg, db=SessionLocal(), session_id="s1", conversation_id="c1",
            api_key="fake", confirm_store=confirm_store, gemini_caller=spy,
        ):
            pass

    asyncio.run(drain())
    assert spy.call_args.kwargs["system_instruction"] == SRE_COPILOT_SYSTEM_PROMPT
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/chat/test_guardrail.py -v`
Expected: FAIL — `KeyError: 'system_instruction'` (the orchestrator does not pass it yet).

- [ ] **Step 3: Import the prompt in the orchestrator**

In `backend/app/chat/orchestrator.py`, add to the imports block (after the other `app.chat` imports, around line 16-19):

```python
from app.chat.prompt import SRE_COPILOT_SYSTEM_PROMPT
```

- [ ] **Step 4: Add the param and pass it in `run_turn`**

In `run_turn`, add a `system_prompt` parameter. Current signature (around line 65):

```python
def run_turn(
    *,
    messages: list[dict],
    registry: ToolRegistry,
    db: Session,
    session_id: str,
    conversation_id: str,
    api_key: str,
    model: str | None = None,
) -> OrchestratorResult:
```

becomes:

```python
def run_turn(
    *,
    messages: list[dict],
    registry: ToolRegistry,
    db: Session,
    session_id: str,
    conversation_id: str,
    api_key: str,
    model: str | None = None,
    system_prompt: str = SRE_COPILOT_SYSTEM_PROMPT,
) -> OrchestratorResult:
```

Then both `_call_gemini(...)` calls inside `run_turn` get `system_instruction=system_prompt`. The loop call (around line 83):

```python
        resp = _call_gemini(
            messages=messages, tools=tool_decls,
            model=model, api_key=api_key, temperature=0.0,
            tool_results=tool_results,
            system_instruction=system_prompt,
        )
```

The tool-ceiling synthesis call (around line 100):

```python
    resp = _call_gemini(
        messages=messages + [{"role": "user",
                              "content": "Tool call limit reached. Respond with text only."}],
        tools=[], model=model, api_key=api_key, temperature=0.3,
        tool_results=tool_results,
        system_instruction=system_prompt,
    )
```

- [ ] **Step 5: Add the param and pass it in `run_turn_streaming`**

In `run_turn_streaming`, add the same parameter. Current signature (around line 137):

```python
async def run_turn_streaming(
    *,
    messages: list[dict],
    registry: ToolRegistry,
    db: Session,
    session_id: str,
    conversation_id: str,
    api_key: str,
    confirm_store: ConfirmStore,
    model: str | None = None,
    gemini_caller: Callable[..., ChatWithToolsResponse] | None = None,
) -> AsyncIterator[dict]:
```

becomes (add `system_prompt` before `gemini_caller`):

```python
async def run_turn_streaming(
    *,
    messages: list[dict],
    registry: ToolRegistry,
    db: Session,
    session_id: str,
    conversation_id: str,
    api_key: str,
    confirm_store: ConfirmStore,
    model: str | None = None,
    system_prompt: str = SRE_COPILOT_SYSTEM_PROMPT,
    gemini_caller: Callable[..., ChatWithToolsResponse] | None = None,
) -> AsyncIterator[dict]:
```

Then the single model call inside the loop (around line 164) gets `system_instruction=system_prompt`:

```python
        try:
            resp = call_gemini(
                messages=messages, tools=tool_decls,
                model=model, api_key=api_key, temperature=0.0,
                tool_results=tool_results,
                system_instruction=system_prompt,
            )
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/chat/test_guardrail.py -v`
Expected: PASS (2 passed)

- [ ] **Step 7: Run the full chat suite for regressions**

Run: `cd backend && python -m pytest tests/chat -q`
Expected: PASS — all chat tests green (existing fakes use `lambda **_:` / `return_value=`, so the extra kwarg is harmless).

- [ ] **Step 8: Commit**

```bash
git add backend/app/chat/orchestrator.py backend/tests/chat/test_guardrail.py
git commit -m "feat(chat): apply guardrail prompt on every orchestrator LLM call"
```

---

### Task 4: Render assistant answers as markdown (frontend)

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/components/chat/MessageList.tsx`

- [ ] **Step 1: Add the dependencies**

Run: `cd frontend && npm install react-markdown@^10.1.0 remark-gfm@^4.0.1`
Expected: both packages added to `package.json` `dependencies` and installed without error.

- [ ] **Step 2: Replace `MessageList.tsx` to render assistant markdown**

Overwrite `frontend/src/components/chat/MessageList.tsx` with:

```tsx
import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { DisplayMessage } from '../../hooks/useChatStream';
import ToolEvent from './ToolEvent';
import ConfirmCard from './ConfirmCard';

// Markdown renderers styled for the chat bubble using itops theme tokens.
// react-markdown does not render raw HTML by default, so model text is safe.
const mdComponents: Components = {
  table: ({ node, ...props }) => (
    <table className="border-collapse w-full my-2 text-[13px]" {...props} />
  ),
  th: ({ node, ...props }) => (
    <th className="border border-hairline-strong/60 px-2 py-1 bg-ink/10 font-semibold text-left" {...props} />
  ),
  td: ({ node, ...props }) => (
    <td className="border border-hairline-strong/40 px-2 py-1 align-top" {...props} />
  ),
  ul: ({ node, ...props }) => <ul className="list-disc ml-4 my-1 space-y-0.5" {...props} />,
  ol: ({ node, ...props }) => <ol className="list-decimal ml-4 my-1 space-y-0.5" {...props} />,
  li: ({ node, ...props }) => <li className="leading-snug" {...props} />,
  p: ({ node, ...props }) => <p className="my-1 leading-relaxed first:mt-0 last:mb-0" {...props} />,
  a: ({ node, ...props }) => (
    <a className="text-accent underline" target="_blank" rel="noopener noreferrer" {...props} />
  ),
  code: ({ node, ...props }) => (
    <code className="px-1 py-0.5 rounded bg-ink/10 font-mono text-[12px]" {...props} />
  ),
  pre: ({ node, ...props }) => (
    <pre className="bg-ink/10 p-2 rounded-md overflow-x-auto my-2 text-[12px]" {...props} />
  ),
};

export default function MessageList({
  messages, onConfirm,
}: {
  messages: DisplayMessage[];
  onConfirm: (cid: string, decision: 'run' | 'cancel') => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {messages.length === 0 && (
        <div className="text-xs text-ink-faint italic text-center pt-8">
          Ask me anything — try "show me critical nodes" or "what was the last incident?"
        </div>
      )}
      {messages.map((m) => (
        <div key={m.id} className={`flex flex-col gap-1.5 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
          {(m.content || (m.role === 'assistant' && m.tools.length === 0 && m.confirms.length === 0)) && (
            <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
              m.role === 'user' ? 'bg-accent text-[var(--color-surface)]' : 'bg-ink/5 text-ink'
            }`}>
              {m.role === 'assistant' && m.content ? (
                // Assistant answers render as markdown (tables/lists/bold).
                <div className="text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                    {m.content}
                  </ReactMarkdown>
                </div>
              ) : (
                // User messages (and the streaming "…" placeholder) stay plain text
                // so user input is never interpreted as markdown.
                <pre className="whitespace-pre-wrap font-sans text-sm">
                  {m.content || (m.role === 'assistant' ? '…' : '')}
                </pre>
              )}
            </div>
          )}
          {m.role === 'assistant' && m.tools.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {m.tools.map((t) => <ToolEvent key={t.toolCallId} inv={t} />)}
            </div>
          )}
          {m.role === 'assistant' && m.confirms.map((c) => (
            <ConfirmCard
              key={c.confirmationId}
              confirmationId={c.confirmationId}
              tool={c.tool}
              args={c.args}
              summary={c.summary}
              decided={c.decided}
              onDecide={onConfirm}
            />
          ))}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck / build to verify it compiles**

Run: `cd frontend && npm run build`
Expected: build succeeds with no TypeScript errors. (If `Components` import errors, confirm `react-markdown` installed at v10.)

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/chat/MessageList.tsx
git commit -m "feat(chat): render assistant answers as markdown"
```

---

## Manual verification (after all tasks)

Run backend (`cd backend && uvicorn app.main:app --reload`) and frontend (`cd frontend && npm run dev`) with a valid Gemini API key configured, open the chat bubble, and check:

- [ ] "who is India's PM?" → one-sentence refusal + redirect, no tool chip appears.
- [ ] "tell me a joke" → refusal.
- [ ] "what does OOMKilled mean?" → answered (general SRE knowledge).
- [ ] "show me the critical nodes" → tool chip runs + answer renders as a markdown table.
- [ ] "fix it" → one clarifying question (e.g. "Which node or incident?").
- [ ] A risky action (e.g. "delete runbook X") → ConfirmCard still appears; copilot does not claim it acted before you confirm.

## Self-review notes

- **Spec coverage:** scope rules → Task 1 prompt; refuse off-topic → Task 1 prompt + asserted in `test_prompt`; clarify-when-vague → Task 1 prompt; `system_instruction` plumbing → Tasks 2–3; both LLM paths wired → Task 3 Steps 4–5 + `test_guardrail`; markdown rendering → Task 4. Non-goals (sessions/memory/charts/suggestions) require no code and are untouched.
- **Type consistency:** `SRE_COPILOT_SYSTEM_PROMPT` (Task 1) is the same symbol imported/asserted in Tasks 2–3; `system_instruction` kwarg name is identical in provider, orchestrator, and tests; `system_prompt` param name is identical across `run_turn` and `run_turn_streaming`.
- **No placeholders:** every code/edit step shows full content.
