import pytest

from app.chat.tools.settings import UpdateSettingTool, UpdateSettingIn
from app.chat.tools.runbooks import DeleteRunbookTool, DeleteRunbookIn
from app.chat.confirm_store import ConfirmStore
from app.database.session import SessionLocal, init_db
from app.database.models import RunbookEntry


@pytest.mark.parametrize("blocked_key", [
    "gemini_api_key", "openai_api_key", "fallback_api_key",
    "cloudwatch_access_key_id", "cloudwatch_secret_access_key",
    "azure_client_secret", "gcp_service_account_json",
])
def test_update_setting_refuses_every_credential_key(blocked_key):
    init_db()
    with SessionLocal() as db:
        with pytest.raises(Exception):
            UpdateSettingTool().execute(
                UpdateSettingIn(key=blocked_key, value="leaked"),
                db=db, idempotency_key="k")


def test_delete_runbook_is_confirmation_gated_and_deletes():
    # Runbooks are UI/Argus-authored with no auto-seeder, so seeded runbooks are
    # deletable for good. The safety guard that remains is that delete is RISKY —
    # it always routes through a confirmation card before it runs.
    from app.chat.schemas import SafetyLevel
    assert DeleteRunbookTool.safety == SafetyLevel.RISKY
    init_db()
    with SessionLocal() as db:
        db.add(RunbookEntry(title="canonical", problem_pattern="x",
                            solution_steps="y", is_seeded=True, issue_type="memory_leak"))
        db.commit()
        rb = db.query(RunbookEntry).first()
        out = DeleteRunbookTool().execute(
            DeleteRunbookIn(runbook_id=rb.id), db=db, idempotency_key="k")
        assert out.deleted is True


def test_confirm_store_single_use():
    store = ConfirmStore(ttl_seconds=10)
    cid = store.create(session_id="s", tool="x", args={}, summary="")
    assert store.resolve(cid, session_id="s", decision="run") is True
    assert store.resolve(cid, session_id="s", decision="run") is False


def test_confirm_store_rejects_wrong_session():
    store = ConfirmStore(ttl_seconds=10)
    cid = store.create(session_id="alice", tool="x", args={}, summary="")
    assert store.resolve(cid, session_id="mallory", decision="run") is False


def test_risky_tools_are_flagged_risky():
    """Every mutating tool the catalog exposes must be SafetyLevel.RISKY so
    the orchestrator routes it through confirmation."""
    from app.chat.schemas import SafetyLevel
    from app.chat.tools.runbooks import DeleteRunbookTool
    from app.chat.tools.simulators import DeleteSimulatorTool
    from app.chat.tools.datasources import DisconnectDataSourceTool
    from app.chat.tools.settings import UpdateSettingTool, PurgeSelfEmittedLogsTool
    for cls in (DeleteRunbookTool, DeleteSimulatorTool, DisconnectDataSourceTool,
                UpdateSettingTool, PurgeSelfEmittedLogsTool):
        assert cls().safety == SafetyLevel.RISKY, f"{cls.__name__} must be risky"
