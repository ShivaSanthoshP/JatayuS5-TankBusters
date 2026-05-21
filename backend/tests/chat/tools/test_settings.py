import pytest

from app.chat.tools.settings import (
    GetSettingsTool, GetSettingsIn,
    UpdateSettingTool, UpdateSettingIn,
    PurgeSelfEmittedLogsTool, PurgeSelfEmittedLogsIn,
    MUTABLE_KEYS,
)
from app.database.session import SessionLocal, init_db


def test_get_settings_omits_secrets():
    init_db()
    with SessionLocal() as db:
        out = GetSettingsTool().execute(GetSettingsIn(), db=db, idempotency_key="k")
    for k, v in out.settings.items():
        # `*_set` keys are boolean presence flags, not secrets.
        if k.endswith("_set"):
            continue
        if "api_key" in k or "secret" in k:
            assert v in ("***", "", None), f"{k} leaked a raw value"


def test_update_setting_blocks_credential_keys():
    init_db()
    with SessionLocal() as db:
        with pytest.raises(Exception):
            UpdateSettingTool().execute(
                UpdateSettingIn(key="gemini_api_key", value="leaked-xyz"),
                db=db, idempotency_key="k")


def test_update_setting_allows_whitelisted():
    init_db()
    assert "gemini_model" in MUTABLE_KEYS
    with SessionLocal() as db:
        out = UpdateSettingTool().execute(
            UpdateSettingIn(key="gemini_model", value="gemini-2.5-flash"),
            db=db, idempotency_key="k")
        assert out.applied is True


def test_purge_self_emitted_logs_runs():
    init_db()
    with SessionLocal() as db:
        out = PurgeSelfEmittedLogsTool().execute(
            PurgeSelfEmittedLogsIn(), db=db, idempotency_key="k")
        assert out.deleted >= 0
