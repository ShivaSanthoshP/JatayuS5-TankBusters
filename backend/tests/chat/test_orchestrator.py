import asyncio
from unittest.mock import patch

from app.chat.orchestrator import run_turn, run_turn_streaming, OrchestratorResult
from app.chat.registry import ToolRegistry
from app.chat.confirm_store import ConfirmStore
from app.chat.tools.infra import ListNodesTool
from app.database.session import SessionLocal, init_db
from app.database.models import InfrastructureNode
from app.llm.provider import ChatWithToolsResponse, ToolCall


def _seed(db):
    db.add(InfrastructureNode(node_name="n1", node_type="server", provider="aws",
                              region="ap-south-1", ip_address="", status="critical"))
    db.commit()


def _registry():
    reg = ToolRegistry()
    reg.register(ListNodesTool())
    return reg


def test_orchestrator_executes_tool_and_returns_text():
    init_db()
    reg = _registry()
    with SessionLocal() as db:
        _seed(db)
        responses = iter([
            ChatWithToolsResponse(tool_calls=[ToolCall(name="list_nodes", args={"status": "critical"})]),
            ChatWithToolsResponse(text="You have 1 critical node: n1."),
        ])
        with patch("app.chat.orchestrator._call_gemini", side_effect=lambda **_: next(responses)):
            result = run_turn(
                messages=[{"role": "user", "content": "what's critical?"}],
                registry=reg, db=db, session_id="s1", conversation_id="c1",
                api_key="fake",
            )
        assert isinstance(result, OrchestratorResult)
        assert "n1" in result.text
        assert len(result.tool_invocations) == 1
        assert result.tool_invocations[0].tool == "list_nodes"
        assert result.tool_invocations[0].status == "ok"


def test_orchestrator_enforces_call_ceiling():
    init_db()
    reg = _registry()
    with SessionLocal() as db:
        _seed(db)
        always_tool = ChatWithToolsResponse(tool_calls=[ToolCall(name="list_nodes", args={})])
        with patch("app.chat.orchestrator._call_gemini", return_value=always_tool):
            result = run_turn(
                messages=[{"role": "user", "content": "loop"}],
                registry=reg, db=db, session_id="s1", conversation_id="c1",
                api_key="fake",
            )
        assert len(result.tool_invocations) <= 8
        assert result.terminated_reason == "tool_call_ceiling"


def test_streaming_yields_tool_started_and_result():
    init_db()
    reg = _registry()
    with SessionLocal() as db:
        _seed(db)
        responses = iter([
            ChatWithToolsResponse(tool_calls=[ToolCall(name="list_nodes", args={"status": "critical"})]),
            ChatWithToolsResponse(text="One critical node."),
        ])
        confirm_store = ConfirmStore()
        events: list[dict] = []

        async def collect():
            async for evt in run_turn_streaming(
                messages=[{"role": "user", "content": "what's critical?"}],
                registry=reg, db=db, session_id="s1", conversation_id="c1",
                api_key="fake", confirm_store=confirm_store,
                gemini_caller=lambda **_: next(responses),
            ):
                events.append(evt)

        asyncio.run(collect())
        event_types = [e["event"] for e in events]
        assert "tool_started" in event_types
        assert "tool_result" in event_types
        assert event_types[-1] == "done"
        assert any(e["event"] == "token" for e in events)
