from __future__ import annotations
"""Chat orchestrator: function-calling loop over the tool registry.

`run_turn` is the synchronous, non-streaming variant (used by tests and
simple callers). `run_turn_streaming` is the async generator that yields
SSE event dicts and handles the risky-tool confirmation pause/resume.
"""

import logging
import uuid as _uuid
from dataclasses import dataclass, field
from typing import AsyncIterator, Callable

from sqlalchemy.orm import Session

from app.chat.confirm_store import ConfirmStore, PendingDecision
from app.chat.prompt import SRE_COPILOT_SYSTEM_PROMPT
from app.chat.registry import ToolRegistry, ToolExecutionError
from app.chat.schemas import SafetyLevel
from app.llm.provider import (
    ChatWithToolsResponse, ToolCall, ToolDecl, chat_with_tools, chat_with_tools_stream,
)
from app.services.settings_service import settings

logger = logging.getLogger("itops.chat.orchestrator")

MAX_TOOL_CALLS_PER_TURN = 8


@dataclass
class ToolInvocation:
    tool: str
    args: dict
    status: str  # ok | error | timeout | not_found | invalid_args | cancelled
    result: dict | None = None
    error: str | None = None


@dataclass
class OrchestratorResult:
    text: str
    tool_invocations: list[ToolInvocation] = field(default_factory=list)
    terminated_reason: str = "model_text"  # model_text | tool_call_ceiling | error


def _build_tool_decls(registry: ToolRegistry) -> list[ToolDecl]:
    decls: list[ToolDecl] = []
    for tool in registry.all():
        schema = tool.input_model.model_json_schema()
        schema.pop("title", None)
        decls.append(ToolDecl(
            name=tool.name, description=tool.description, parameters_schema=schema,
        ))
    return decls


def _call_gemini(**kwargs) -> ChatWithToolsResponse:
    """Indirection so tests can patch the LLM call."""
    return chat_with_tools(**kwargs)


def _chunk_text(text: str, n: int) -> list[str]:
    return [text[i:i + n] for i in range(0, len(text), n)] or [""]


# ── Non-streaming turn ──────────────────────────────────────────────

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
    """Execute one user turn (no streaming, no confirmation). Risky tools
    are refused here — the streaming path handles suspend/resume."""
    model = model or settings.gemini_model or "gemini-2.5-flash"
    tool_decls = _build_tool_decls(registry)
    tool_results: list[dict] = []
    invocations: list[ToolInvocation] = []

    for _ in range(MAX_TOOL_CALLS_PER_TURN):
        resp = _call_gemini(
            messages=messages, tools=tool_decls,
            model=model, api_key=api_key, temperature=0.0,
            tool_results=tool_results,
            system_instruction=system_prompt,
        )
        if not resp.tool_calls:
            return OrchestratorResult(text=resp.text, tool_invocations=invocations,
                                      terminated_reason="model_text")
        for call in resp.tool_calls:
            inv = _dispatch(call, registry, db, session_id, conversation_id)
            invocations.append(inv)
            tool_results.append({
                "name": call.name, "args": call.args,
                "thought_signature": call.thought_signature,
                "result": inv.result if inv.status == "ok"
                          else {"error": inv.error, "kind": inv.status},
            })

    resp = _call_gemini(
        messages=messages + [{"role": "user",
                              "content": "Tool call limit reached. Respond with text only."}],
        tools=[], model=model, api_key=api_key, temperature=0.3,
        tool_results=tool_results,
        system_instruction=system_prompt,
    )
    return OrchestratorResult(
        text=resp.text or "I ran out of steps mid-task.",
        tool_invocations=invocations,
        terminated_reason="tool_call_ceiling",
    )


def _dispatch(call: ToolCall, registry: ToolRegistry, db: Session,
              session_id: str, conversation_id: str) -> ToolInvocation:
    tool = registry.get(call.name)
    if tool is None:
        return ToolInvocation(tool=call.name, args=call.args, status="not_found",
                              error=f"Unknown tool: {call.name}")
    if tool.safety == SafetyLevel.RISKY:
        return ToolInvocation(tool=call.name, args=call.args, status="error",
                              error="Risky tools require the streaming orchestrator.")
    try:
        result = registry.dispatch(
            call.name, call.args, db=db, session_id=session_id,
            conversation_id=conversation_id, was_confirmed=False,
            idempotency_key=str(_uuid.uuid4()),
        )
        return ToolInvocation(tool=call.name, args=call.args, status="ok",
                              result=result.model_dump())
    except ToolExecutionError as exc:
        return ToolInvocation(tool=call.name, args=call.args, status=exc.kind,
                              error=str(exc))


# ── Streaming turn (SSE) ────────────────────────────────────────────

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
    """Async generator yielding SSE event dicts. Event shapes:
      {"event": "tool_started",     "data": {tool_call_id, tool, args}}
      {"event": "tool_result",      "data": {tool_call_id, status, result?, error?}}
      {"event": "confirm_required", "data": {confirmation_id, tool, args, summary}}
      {"event": "token",            "data": {"text": "..."}}
      {"event": "done",             "data": {"terminated_reason": "..."}}
      {"event": "error",            "data": {"message": "..."}}
    """
    model = model or settings.gemini_model or "gemini-2.5-flash"
    tool_decls = _build_tool_decls(registry)
    tool_results: list[dict] = []

    for _ in range(MAX_TOOL_CALLS_PER_TURN):
        # ── Get the model's response for this step ──────────────────
        # Production streams tokens live via the async google-genai client.
        # An injected gemini_caller (tests) takes the non-streaming path.
        if gemini_caller is not None:
            try:
                resp = gemini_caller(
                    messages=messages, tools=tool_decls,
                    model=model, api_key=api_key, temperature=0.0,
                    tool_results=tool_results,
                    system_instruction=system_prompt,
                )
            except Exception as exc:
                logger.exception("Gemini call failed during streaming turn")
                yield {"event": "error", "data": {"message": f"LLM call failed: {exc}"}}
                yield {"event": "done", "data": {"terminated_reason": "error"}}
                return
            if not resp.tool_calls:
                for chunk in _chunk_text(resp.text or "", 80):
                    yield {"event": "token", "data": {"text": chunk}}
                yield {"event": "done", "data": {"terminated_reason": "model_text"}}
                return
        else:
            resp = ChatWithToolsResponse()
            streamed_any = False
            try:
                async for item in chat_with_tools_stream(
                    messages=messages, tools=tool_decls,
                    model=model, api_key=api_key, temperature=0.0,
                    tool_results=tool_results,
                    system_instruction=system_prompt,
                ):
                    if item["type"] == "text":
                        streamed_any = True
                        yield {"event": "token", "data": {"text": item["delta"]}}
                    else:  # "final"
                        resp = item["response"]
            except Exception as exc:
                logger.exception("Gemini call failed during streaming turn")
                yield {"event": "error", "data": {"message": f"LLM call failed: {exc}"}}
                yield {"event": "done", "data": {"terminated_reason": "error"}}
                return
            if not resp.tool_calls:
                # Text already streamed live; cover the rare case where text
                # only landed on the final response object.
                if not streamed_any and resp.text:
                    yield {"event": "token", "data": {"text": resp.text}}
                yield {"event": "done", "data": {"terminated_reason": "model_text"}}
                return

        # ── Tool-calling step (shared by both paths) ─────────────────
        for call in resp.tool_calls:
            tool_call_id = str(_uuid.uuid4())
            tool = registry.get(call.name)
            if tool is None:
                yield {"event": "tool_started",
                       "data": {"tool_call_id": tool_call_id, "tool": call.name, "args": call.args}}
                yield {"event": "tool_result",
                       "data": {"tool_call_id": tool_call_id, "status": "not_found",
                                "error": f"Unknown tool: {call.name}"}}
                tool_results.append({"name": call.name, "args": call.args,
                                     "thought_signature": call.thought_signature,
                                     "result": {"error": "unknown tool"}})
                continue

            if tool.safety == SafetyLevel.RISKY:
                try:
                    preview = tool.preview(tool.input_model.model_validate(call.args))
                except Exception:
                    preview = f"Run {call.name}."
                cid = confirm_store.create(
                    session_id=session_id, tool=call.name,
                    args=call.args, summary=preview,
                )
                yield {"event": "confirm_required",
                       "data": {"confirmation_id": cid, "tool": call.name,
                                "args": call.args, "summary": preview}}
                decision = await confirm_store.wait_for_decision(cid)
                if decision != PendingDecision.RUN:
                    yield {"event": "tool_result",
                           "data": {"tool_call_id": tool_call_id, "status": decision.value,
                                    "error": f"User {decision.value}"}}
                    tool_results.append({"name": call.name, "args": call.args,
                                         "thought_signature": call.thought_signature,
                                         "result": {"declined": decision.value}})
                    continue
                was_confirmed = True
            else:
                was_confirmed = False

            yield {"event": "tool_started",
                   "data": {"tool_call_id": tool_call_id, "tool": call.name, "args": call.args}}
            try:
                out = registry.dispatch(
                    call.name, call.args, db=db, session_id=session_id,
                    conversation_id=conversation_id, was_confirmed=was_confirmed,
                    idempotency_key=tool_call_id,
                )
                inv_result = out.model_dump()
                yield {"event": "tool_result",
                       "data": {"tool_call_id": tool_call_id, "status": "ok",
                                "result": inv_result}}
                tool_results.append({"name": call.name, "args": call.args,
                                     "thought_signature": call.thought_signature,
                                     "result": inv_result})
            except ToolExecutionError as exc:
                yield {"event": "tool_result",
                       "data": {"tool_call_id": tool_call_id, "status": exc.kind,
                                "error": str(exc)}}
                tool_results.append({"name": call.name, "args": call.args,
                                     "thought_signature": call.thought_signature,
                                     "result": {"error": str(exc)}})

    yield {"event": "token", "data": {"text": "Reached tool-call limit; stopping here."}}
    yield {"event": "done", "data": {"terminated_reason": "tool_call_ceiling"}}
