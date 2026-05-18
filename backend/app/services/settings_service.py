"""
Runtime settings service — persistent mutable configuration store.

Allows the Settings UI to change models, toggle auto-run pipeline,
pick the active LLM provider (ollama / openai / gemini), and store
per-provider credentials without restarting the server.

Values are persisted to a JSON file on disk so API keys survive
restart. Env vars act as defaults only on first boot.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import threading
from pathlib import Path
from typing import Any

from app.config import (
    OLLAMA_MODEL,
    OLLAMA_EMBEDDING_MODEL,
    OLLAMA_BASE_URL,
    OPENAI_API_KEY,
    OPENAI_MODEL,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    LLM_PROVIDER,
    AGENT_TEMPERATURE,
    BASE_DIR,
    CLOUDWATCH_ACCESS_KEY_ID,
    CLOUDWATCH_SECRET_ACCESS_KEY,
    CLOUDWATCH_REGION,
    CLOUDWATCH_INSTANCE_IDS,
    CLOUDWATCH_POLL_INTERVAL_SECONDS,
    AZURE_TENANT_ID,
    AZURE_CLIENT_ID,
    AZURE_CLIENT_SECRET,
    AZURE_SUBSCRIPTION_ID,
    AZURE_RESOURCE_GROUP,
    AZURE_POLL_INTERVAL_SECONDS,
    GCP_PROJECT_ID,
    GCP_SERVICE_ACCOUNT_JSON,
    GCP_ZONE,
    GCP_POLL_INTERVAL_SECONDS,
)

logger = logging.getLogger("itops.settings_service")

SETTINGS_FILE = Path(BASE_DIR) / "runtime_settings.json"

SUPPORTED_LLM_PROVIDERS = ("ollama", "openai", "gemini")

# Keys that must never be echoed back to any caller in cleartext.
_SECRET_FIELDS = (
    "openai_api_key",
    "gemini_api_key",
    "cloudwatch_access_key_id",
    "cloudwatch_secret_access_key",
    "azure_client_secret",
    "gcp_service_account_json",
)

# ── At-rest encryption for persisted secrets ───────────────────────
# Key is derived from SETTINGS_SECRET_KEY env var (or a machine-specific
# fallback). Values are base64-encoded Fernet ciphertext on disk.

def _derive_fernet_key() -> bytes:
    """Derive a 32-byte Fernet key from the env var or machine hostname."""
    raw = os.getenv("SETTINGS_SECRET_KEY") or os.uname().nodename or "itops-default"
    return base64.urlsafe_b64encode(hashlib.sha256(raw.encode()).digest())


def _encrypt_secret(value: str) -> str:
    """Return Fernet-encrypted, base64-encoded ciphertext for a secret string."""
    if not value:
        return value
    try:
        from cryptography.fernet import Fernet
        return Fernet(_derive_fernet_key()).encrypt(value.encode()).decode()
    except Exception:
        return value


def _decrypt_secret(value: str) -> str:
    """Decrypt a Fernet ciphertext produced by _encrypt_secret."""
    if not value:
        return value
    try:
        from cryptography.fernet import Fernet, InvalidToken
        return Fernet(_derive_fernet_key()).decrypt(value.encode()).decode()
    except Exception:
        # Not encrypted (legacy plaintext value) — return as-is.
        return value


class _Settings:
    """Thread-safe singleton holding mutable runtime settings."""

    def __init__(self):
        self._lock = threading.RLock()

        # ── LLM provider selection ──────────────────────────
        # Exactly one of: "ollama", "openai", "gemini".
        self.llm_provider: str = (
            LLM_PROVIDER if LLM_PROVIDER in SUPPORTED_LLM_PROVIDERS else "ollama"
        )

        # ── Ollama settings (local) ─────────────────────────
        self.ollama_model: str = OLLAMA_MODEL
        self.ollama_embedding_model: str = OLLAMA_EMBEDDING_MODEL
        self.ollama_base_url: str = OLLAMA_BASE_URL

        # ── OpenAI settings ─────────────────────────────────
        self.openai_api_key: str = OPENAI_API_KEY
        self.openai_model: str = OPENAI_MODEL

        # ── Gemini settings ─────────────────────────────────
        self.gemini_api_key: str = GEMINI_API_KEY
        self.gemini_model: str = GEMINI_MODEL

        # ── Shared agent settings ───────────────────────────
        self.agent_temperature: float = AGENT_TEMPERATURE

        # User-defined custom models that should appear in dropdowns,
        # keyed by provider (e.g. "ollama", "openai", "gemini").
        self.custom_llm_models: list[str] = []
        self.custom_embedding_models: list[str] = []
        self.custom_openai_models: list[str] = []
        self.custom_gemini_models: list[str] = []

        # ── Auto-run pipeline settings ──────────────────────
        self.auto_run_pipeline: bool = False
        self.auto_run_interval_seconds: int = 60

        # ── AWS CloudWatch ──────────────────────────────────
        self.cloudwatch_access_key_id: str = CLOUDWATCH_ACCESS_KEY_ID
        self.cloudwatch_secret_access_key: str = CLOUDWATCH_SECRET_ACCESS_KEY
        self.cloudwatch_region: str = CLOUDWATCH_REGION
        self.cloudwatch_instance_ids: list[str] = list(CLOUDWATCH_INSTANCE_IDS)
        self.cloudwatch_poll_interval_seconds: int = CLOUDWATCH_POLL_INTERVAL_SECONDS
        self.cloudwatch_status: str = "disconnected"
        self.cloudwatch_error: str | None = None

        # ── Azure Monitor ───────────────────────────────────
        self.azure_tenant_id: str = AZURE_TENANT_ID
        self.azure_client_id: str = AZURE_CLIENT_ID
        self.azure_client_secret: str = AZURE_CLIENT_SECRET
        self.azure_subscription_id: str = AZURE_SUBSCRIPTION_ID
        self.azure_resource_group: str = AZURE_RESOURCE_GROUP
        self.azure_poll_interval_seconds: int = AZURE_POLL_INTERVAL_SECONDS
        self.azure_status: str = "disconnected"
        self.azure_error: str | None = None

        # ── GCP Cloud Monitoring ────────────────────────────
        self.gcp_project_id: str = GCP_PROJECT_ID
        self.gcp_service_account_json: str = GCP_SERVICE_ACCOUNT_JSON
        self.gcp_zone: str = GCP_ZONE
        self.gcp_poll_interval_seconds: int = GCP_POLL_INTERVAL_SECONDS
        self.gcp_status: str = "disconnected"
        self.gcp_error: str | None = None

        # Monotonically increasing version counter so consumers
        # (e.g. cached LLM singletons) can detect config changes.
        self._version: int = 0

        self._load_from_disk()

    # ── Persistence ─────────────────────────────────────────

    _PERSISTED_FIELDS = (
        "llm_provider",
        "ollama_model",
        "ollama_embedding_model",
        "ollama_base_url",
        "openai_api_key",
        "openai_model",
        "gemini_api_key",
        "gemini_model",
        "agent_temperature",
        "custom_llm_models",
        "custom_embedding_models",
        "custom_openai_models",
        "custom_gemini_models",
        "auto_run_pipeline",
        "auto_run_interval_seconds",
        # Cloud providers
        "cloudwatch_access_key_id",
        "cloudwatch_secret_access_key",
        "cloudwatch_region",
        "cloudwatch_instance_ids",
        "cloudwatch_poll_interval_seconds",
        "cloudwatch_status",
        "cloudwatch_error",
        "azure_tenant_id",
        "azure_client_id",
        "azure_client_secret",
        "azure_subscription_id",
        "azure_resource_group",
        "azure_poll_interval_seconds",
        "azure_status",
        "azure_error",
        "gcp_project_id",
        "gcp_service_account_json",
        "gcp_zone",
        "gcp_poll_interval_seconds",
        "gcp_status",
        "gcp_error",
    )

    def _load_from_disk(self) -> None:
        if not SETTINGS_FILE.exists():
            return
        try:
            with open(SETTINGS_FILE, "r") as f:
                saved = json.load(f)
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Failed to read %s: %s — using defaults", SETTINGS_FILE, exc)
            return

        for key in self._PERSISTED_FIELDS:
            if key in saved and hasattr(self, key):
                value = saved[key]
                if key in _SECRET_FIELDS and isinstance(value, str):
                    value = _decrypt_secret(value)
                setattr(self, key, value)

    def _save_to_disk(self) -> None:
        data = {}
        for key in self._PERSISTED_FIELDS:
            value = getattr(self, key)
            if key in _SECRET_FIELDS and isinstance(value, str):
                value = _encrypt_secret(value)
            data[key] = value
        try:
            tmp = SETTINGS_FILE.with_suffix(".json.tmp")
            with open(tmp, "w") as f:
                json.dump(data, f, indent=2)
            tmp.replace(SETTINGS_FILE)
        except OSError as exc:
            logger.error("Failed to persist settings to %s: %s", SETTINGS_FILE, exc)

    # ── Getters ─────────────────────────────────────────────

    @property
    def version(self) -> int:
        return self._version

    def snapshot(self, *, include_secrets: bool = False) -> dict[str, Any]:
        """Return a JSON-serialisable snapshot of current settings.

        With include_secrets=False (default), secret fields are replaced
        with a redacted placeholder string — safe to return over HTTP.
        """
        with self._lock:
            raw: dict[str, Any] = {
                "llm_provider": self.llm_provider,
                "ollama_model": self.ollama_model,
                "ollama_embedding_model": self.ollama_embedding_model,
                "ollama_base_url": self.ollama_base_url,
                "openai_api_key": self.openai_api_key,
                "openai_model": self.openai_model,
                "gemini_api_key": self.gemini_api_key,
                "gemini_model": self.gemini_model,
                "agent_temperature": self.agent_temperature,
                "custom_llm_models": list(self.custom_llm_models),
                "custom_embedding_models": list(self.custom_embedding_models),
                "custom_openai_models": list(self.custom_openai_models),
                "custom_gemini_models": list(self.custom_gemini_models),
                "auto_run_pipeline": self.auto_run_pipeline,
                "auto_run_interval_seconds": self.auto_run_interval_seconds,
                # Cloud providers
                "cloudwatch_access_key_id": self.cloudwatch_access_key_id,
                "cloudwatch_secret_access_key": self.cloudwatch_secret_access_key,
                "cloudwatch_region": self.cloudwatch_region,
                "cloudwatch_instance_ids": list(self.cloudwatch_instance_ids),
                "cloudwatch_poll_interval_seconds": self.cloudwatch_poll_interval_seconds,
                "cloudwatch_status": self.cloudwatch_status,
                "cloudwatch_error": self.cloudwatch_error,
                "azure_tenant_id": self.azure_tenant_id,
                "azure_client_id": self.azure_client_id,
                "azure_client_secret": self.azure_client_secret,
                "azure_subscription_id": self.azure_subscription_id,
                "azure_resource_group": self.azure_resource_group,
                "azure_poll_interval_seconds": self.azure_poll_interval_seconds,
                "azure_status": self.azure_status,
                "azure_error": self.azure_error,
                "gcp_project_id": self.gcp_project_id,
                "gcp_service_account_json": self.gcp_service_account_json,
                "gcp_zone": self.gcp_zone,
                "gcp_poll_interval_seconds": self.gcp_poll_interval_seconds,
                "gcp_status": self.gcp_status,
                "gcp_error": self.gcp_error,
            }
            if include_secrets:
                return raw

            for field in _SECRET_FIELDS:
                val = raw.get(field)
                raw[field + "_set"] = bool(val)
                raw[field] = "***" if val else ""
            return raw

    def get_secret(self, field: str) -> str:
        """Return the plaintext value of a single secret field.

        Prefer this over snapshot(include_secrets=True) — it only exposes
        one field rather than the entire settings dict.
        """
        with self._lock:
            return getattr(self, field, "")

    # ── Setters ─────────────────────────────────────────────

    def update(self, **kwargs) -> dict[str, Any]:
        """Update one or more settings. Returns the redacted snapshot."""
        with self._lock:
            changed = False
            for key, value in kwargs.items():
                if not hasattr(self, key) or key.startswith("_"):
                    continue
                if key == "llm_provider":
                    value = (value or "").lower()
                    if value not in SUPPORTED_LLM_PROVIDERS:
                        continue
                # Ignore redaction placeholder so the UI can submit the
                # snapshot unchanged without overwriting stored keys.
                if key in _SECRET_FIELDS and value == "***":
                    continue
                old = getattr(self, key)
                if old != value:
                    setattr(self, key, value)
                    changed = True
            if changed:
                self._version += 1
                self._save_to_disk()
            return self.snapshot()


# ── Module-level singleton ──────────────────────────────────

settings = _Settings()
