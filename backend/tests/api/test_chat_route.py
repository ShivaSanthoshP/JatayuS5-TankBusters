import json
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.database.session import init_db
from app.llm.provider import ChatWithToolsResponse, ToolCall


# NOTE: TestClient is used WITHOUT a `with` block on purpose. Entering the
# context manager fires the app lifespan, which boots the background
# simulator loops — those pound the same SQLite file and cause lock
# contention with the chat audit-log writes. Plain TestClient(app) skips
# lifespan and keeps these tests hermetic and fast.

def test_chat_sse_emits_tool_then_text():
    init_db()
    responses = iter([
        ChatWithToolsResponse(tool_calls=[ToolCall(name="list_nodes", args={})]),
        ChatWithToolsResponse(text="No nodes registered yet."),
    ])
    client = TestClient(app)
    with patch("app.chat.orchestrator._call_gemini", side_effect=lambda **_: next(responses)), \
         patch("app.api.routes.chat.settings.get_secret", return_value="fake-key"):
        with client.stream("POST", "/api/chat", json={
            "session_id": "s1",
            "messages": [{"role": "user", "content": "show me nodes"}],
        }) as r:
            assert r.status_code == 200
            assert r.headers["content-type"].startswith("text/event-stream")
            events = []
            for line in r.iter_lines():
                if not line.startswith("data:"):
                    continue
                events.append(json.loads(line[len("data:"):].strip()))
                if events[-1].get("event") == "done":
                    break
    types = [e["event"] for e in events]
    assert "tool_started" in types
    assert "tool_result" in types
    assert types[-1] == "done"


def test_confirm_endpoint_rejects_wrong_session():
    init_db()
    from app.chat.confirm_store import store
    cid = store.create(session_id="alice", tool="x", args={}, summary="x")
    client = TestClient(app)
    resp = client.post("/api/chat/confirm", json={
        "session_id": "mallory", "confirmation_id": cid, "decision": "run",
    })
    assert resp.status_code == 403


def test_chat_health_reports_tools():
    client = TestClient(app)
    resp = client.get("/api/chat/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["tools_registered"] >= 1
