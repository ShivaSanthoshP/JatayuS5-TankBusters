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
