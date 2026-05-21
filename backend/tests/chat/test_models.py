from app.database.models import ChatAction
from app.database.session import SessionLocal, init_db


def test_chat_action_roundtrip():
    init_db()
    with SessionLocal() as db:
        row = ChatAction(
            session_id="sess-1",
            conversation_id="conv-1",
            tool_name="list_nodes",
            tool_args={"status": "critical"},
            tool_result={"count": 5},
            status="ok",
            was_confirmed=False,
            latency_ms=42,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        assert row.id is not None
        assert row.tool_args == {"status": "critical"}
        assert row.created_at is not None
