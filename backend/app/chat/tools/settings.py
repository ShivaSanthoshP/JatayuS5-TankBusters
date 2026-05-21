from __future__ import annotations
"""Settings tools for the SRE Copilot.

`update_setting` is gated to a strict allow-list — credentials and secrets
are deliberately excluded so the chatbot can never set or leak an API key.
"""

from typing import Any

from pydantic import Field
from sqlalchemy.orm import Session

from app.chat.schemas import SafetyLevel, ToolInput, ToolOutput

# Only these keys can be changed from chat. Credentials/secrets are absent
# by design — users change those through the Settings page.
MUTABLE_KEYS = frozenset({
    "llm_provider", "online_provider_name", "fallback_provider_name",
    "gemini_model", "fallback_model",
    "embedding_provider", "gemini_embedding_model",
    "auto_run_pipeline", "auto_run_interval_seconds",
    "agent_temperature", "monitoring_temperature", "predictive_temperature",
    "diagnostic_temperature", "remediation_temperature", "reporting_temperature",
})

_SETTABLE = ", ".join(sorted(MUTABLE_KEYS))


def _normalize_key(key: str) -> str:
    """Map common LLM key guesses to the canonical setting key.

    The model frequently writes an agent temperature as
    '<agent>_agent_temperature' (e.g. 'remediation_agent_temperature') when the
    real key is '<agent>_temperature'. Normalize that one well-known pattern;
    anything else is returned unchanged so the allow-list still gates it.
    """
    if key in MUTABLE_KEYS:
        return key
    candidate = key.replace("_agent_temperature", "_temperature")
    if candidate in MUTABLE_KEYS:
        return candidate
    return key


class GetSettingsIn(ToolInput):
    pass


class GetSettingsOut(ToolOutput):
    settings: dict


class GetSettingsTool:
    name = "get_settings"
    description = "Return the current settings snapshot (secrets redacted to ***)."
    input_model = GetSettingsIn
    output_model = GetSettingsOut
    safety = SafetyLevel.SAFE

    def preview(self, args):
        return ""

    def execute(self, args: GetSettingsIn, *, db: Session, idempotency_key: str) -> GetSettingsOut:
        from app.services.settings_service import settings
        return GetSettingsOut(settings=settings.snapshot())


class UpdateSettingIn(ToolInput):
    key: str = Field(..., description=(
        "Exact setting key to change. One of: " + _SETTABLE + ". "
        "Agent temperatures use '<agent>_temperature' — e.g. the remediation "
        "agent's temperature is 'remediation_temperature'."))
    value: Any


class UpdateSettingOut(ToolOutput):
    key: str
    applied: bool
    new_value: Any = None


class UpdateSettingTool:
    name = "update_setting"
    description = (
        "Update one platform setting from chat: model selections, providers, "
        "agent temperatures, and auto-run. These ARE settable here — do NOT "
        "refuse or redirect the user to the Settings page for them. Use the "
        f"EXACT key name; settable keys: {_SETTABLE}. Agent temperatures are "
        "'<agent>_temperature' (e.g. remediation agent -> 'remediation_temperature'). "
        "Only credentials / API keys are not settable here. Risky."
    )
    input_model = UpdateSettingIn
    output_model = UpdateSettingOut
    safety = SafetyLevel.RISKY

    def preview(self, args: UpdateSettingIn) -> str:
        # Show the canonical key that will actually change, not the raw guess.
        return f"Set {_normalize_key(args.key)} = {args.value!r}"

    def execute(self, args: UpdateSettingIn, *, db: Session, idempotency_key: str) -> UpdateSettingOut:
        key = _normalize_key(args.key)
        if key not in MUTABLE_KEYS:
            raise PermissionError(
                f"Setting '{args.key}' cannot be changed from chat. "
                f"Allowed keys: {_SETTABLE}.")
        from app.services.settings_service import settings
        settings.update(**{key: args.value})
        return UpdateSettingOut(key=key, applied=True,
                                new_value=getattr(settings, key, None))


class PurgeSelfEmittedLogsIn(ToolInput):
    pass


class PurgeSelfEmittedLogsOut(ToolOutput):
    deleted: int


class PurgeSelfEmittedLogsTool:
    name = "purge_self_emitted_logs"
    description = (
        "Delete LogEntry rows emitted by iTOps itself (one-shot cleanup of the "
        "log feedback loop). Risky."
    )
    input_model = PurgeSelfEmittedLogsIn
    output_model = PurgeSelfEmittedLogsOut
    safety = SafetyLevel.RISKY

    def preview(self, args) -> str:
        return ("Delete all LogEntry rows that look self-emitted "
                "(itops-backend, [itops], uvicorn, etc.).")

    def execute(self, args: PurgeSelfEmittedLogsIn, *, db: Session, idempotency_key: str) -> PurgeSelfEmittedLogsOut:
        from app.api.routes.agents import purge_self_emitted_logs as _purge
        result = _purge(db=db)
        return PurgeSelfEmittedLogsOut(deleted=int(result.get("deleted", 0)))
