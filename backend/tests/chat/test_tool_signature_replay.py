"""The orchestrator must thread each tool call's thought_signature into the
tool_results it replays, so the follow-up LLM call can restore it on the
reconstructed functionCall part (Gemini 2.5+ requires it)."""

import asyncio
from unittest.mock import MagicMock

from app.chat.orchestrator import run_turn_streaming
from app.chat.registry import ToolRegistry
from app.chat.confirm_store import ConfirmStore
from app.chat.tools.infra import ListNodesTool
from app.database.session import SessionLocal, init_db
from app.llm.provider import ChatWithToolsResponse, ToolCall


def test_streaming_threads_thought_signature_into_tool_results():
    init_db()
    reg = ToolRegistry()
    reg.register(ListNodesTool())
    confirm_store = ConfirmStore()

    # 1st model turn: call list_nodes WITH a signature. 2nd turn: plain text.
    responses = iter([
        ChatWithToolsResponse(tool_calls=[
            ToolCall(name="list_nodes", args={}, thought_signature=b"sig-xyz")]),
        ChatWithToolsResponse(text="Here are the nodes."),
    ])
    spy = MagicMock(side_effect=lambda **kw: next(responses))

    async def drain():
        async for _ in run_turn_streaming(
            messages=[{"role": "user", "content": "list nodes"}],
            registry=reg, db=SessionLocal(), session_id="s1", conversation_id="c1",
            api_key="fake", confirm_store=confirm_store, gemini_caller=spy,
        ):
            pass

    asyncio.run(drain())
    # The 2nd call replays the tool result; it must carry the signature.
    second_call_kwargs = spy.call_args_list[1].kwargs
    tr = second_call_kwargs["tool_results"]
    assert tr and tr[0]["thought_signature"] == b"sig-xyz"
