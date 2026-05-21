import pytest
from app.chat.registry import ToolRegistry, ToolExecutionError
from app.chat.schemas import SafetyLevel, ToolInput, ToolOutput
from app.database.session import SessionLocal, init_db
from app.database.models import ChatAction


class EchoIn(ToolInput):
    value: int


class EchoOut(ToolOutput):
    doubled: int


class EchoTool:
    name = "echo"
    description = "Doubles the input value."
    input_model = EchoIn
    output_model = EchoOut
    safety = SafetyLevel.SAFE

    def preview(self, args):
        return ""

    def execute(self, args, *, db, idempotency_key):
        return EchoOut(doubled=args.value * 2)


def _registry():
    reg = ToolRegistry()
    reg.register(EchoTool())
    return reg


def test_dispatch_writes_audit_row():
    init_db()
    reg = _registry()
    with SessionLocal() as db:
        result = reg.dispatch(
            "echo", {"value": 5}, db=db,
            session_id="s1", conversation_id="c1",
            was_confirmed=False, idempotency_key="k1",
        )
        assert result.model_dump() == {"doubled": 10}
        row = db.query(ChatAction).filter_by(session_id="s1").one()
        assert row.status == "ok"
        assert row.tool_args == {"value": 5}
        assert row.tool_result == {"doubled": 10}


def test_invalid_args_rejected():
    init_db()
    reg = _registry()
    with SessionLocal() as db:
        with pytest.raises(ToolExecutionError):
            reg.dispatch(
                "echo", {"value": "not-an-int"}, db=db,
                session_id="s1", conversation_id="c1",
                was_confirmed=False, idempotency_key="k2",
            )


def test_unknown_tool_rejected():
    init_db()
    reg = _registry()
    with SessionLocal() as db:
        with pytest.raises(ToolExecutionError):
            reg.dispatch(
                "nonexistent", {}, db=db,
                session_id="s1", conversation_id="c1",
                was_confirmed=False, idempotency_key="k3",
            )


def test_idempotent_replay():
    init_db()
    reg = _registry()
    with SessionLocal() as db:
        a = reg.dispatch("echo", {"value": 5}, db=db, session_id="s1",
                         conversation_id="c1", was_confirmed=False, idempotency_key="dup")
        b = reg.dispatch("echo", {"value": 5}, db=db, session_id="s1",
                         conversation_id="c1", was_confirmed=False, idempotency_key="dup")
        assert a.model_dump() == b.model_dump()
        rows = db.query(ChatAction).filter_by(session_id="s1").all()
        assert len(rows) == 1
