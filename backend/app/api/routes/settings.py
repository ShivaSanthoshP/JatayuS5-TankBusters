"""Settings API — read/update runtime configuration from the UI."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

import ollama
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.services.settings_service import settings, SUPPORTED_LLM_PROVIDERS
from app.llm.provider import test_provider as _test_provider

logger = logging.getLogger("itops.settings")

router = APIRouter(prefix="/settings", tags=["Settings"])

# ── Optional API-key guard for settings endpoints ────────────────────
# Set SETTINGS_API_KEY env var to enable. If unset, the guard is a no-op
# (suitable for local/dev use). Any non-empty value enforces the check.

_SETTINGS_API_KEY = os.getenv("SETTINGS_API_KEY", "")


def _require_settings_auth(x_api_key: str | None = None) -> None:
    if not _SETTINGS_API_KEY:
        return
    from fastapi import Header
    if x_api_key != _SETTINGS_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Api-Key header")


# Track cloud adapter polling tasks so they can be cancelled on shutdown.
_cloud_polling_tasks: set[asyncio.Task] = set()


def _spawn_cloud_task(coro) -> asyncio.Task:
    task = asyncio.create_task(coro)
    _cloud_polling_tasks.add(task)
    task.add_done_callback(_cloud_polling_tasks.discard)
    return task


# ── Pydantic models ─────────────────────────────────────────


class SettingsUpdate(BaseModel):
    # UI mode — "local" (Ollama) or "online" (cloud provider).
    llm_mode: str | None = None

    # Provider selection — exactly one of: ollama | openai | gemini.
    llm_provider: str | None = None

    # Online provider (free-text name, e.g. "Gemini", "OpenAI")
    online_provider_name: str | None = None

    # Fallback LLM
    fallback_provider_name: str | None = None
    fallback_model: str | None = None
    fallback_api_key: str | None = None

    # Ollama (local)
    ollama_model: str | None = None
    ollama_embedding_model: str | None = None
    ollama_base_url: str | None = None

    # OpenAI
    openai_api_key: str | None = None
    openai_model: str | None = None

    # Gemini
    gemini_api_key: str | None = None
    gemini_model: str | None = None

    # Embedding
    embedding_provider: str | None = None
    gemini_embedding_model: str | None = None
    gemini_embedding_api_key: str | None = None

    # Shared
    agent_temperature: float | None = None

    # Per-agent temperatures
    monitoring_temperature:  float | None = None
    predictive_temperature:  float | None = None
    diagnostic_temperature:  float | None = None
    remediation_temperature: float | None = None
    reporting_temperature:   float | None = None
    custom_llm_models: list[str] | None = None
    custom_embedding_models: list[str] | None = None
    custom_openai_models: list[str] | None = None
    custom_gemini_models: list[str] | None = None
    auto_run_pipeline: bool | None = None
    auto_run_interval_seconds: int | None = None


class TestProviderRequest(BaseModel):
    provider: str = Field(..., description="ollama | openai | gemini")
    model: str | None = None
    # For openai / gemini, if api_key is omitted the stored value is used.
    api_key: str | None = None
    # For ollama, if base_url is omitted the stored value is used.
    base_url: str | None = None
    # Which stored key slot to test when api_key is not provided inline.
    key_slot: str | None = Field(None, description="gemini_api_key | fallback_api_key")


# ── Endpoints ────────────────────────────────────────────────


@router.get("/")
def get_settings() -> dict[str, Any]:
    """Return the current runtime settings, with API keys redacted."""
    return settings.snapshot()


@router.put("/")
def update_settings(body: SettingsUpdate) -> dict[str, Any]:
    """Update one or more runtime settings.

    Secret fields submitted as the redaction placeholder ("***") are
    ignored so the UI can round-trip the snapshot without overwriting
    stored keys.
    """
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="No settings provided")

    if "llm_provider" in payload and payload["llm_provider"] not in SUPPORTED_LLM_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"llm_provider must be one of {SUPPORTED_LLM_PROVIDERS}",
        )
    if "llm_mode" in payload and payload["llm_mode"] not in ("local", "online"):
        raise HTTPException(status_code=400, detail="llm_mode must be 'local' or 'online'")

    new_snapshot = settings.update(**payload)
    safe_keys = [k for k in payload.keys() if "api_key" not in k]
    logger.info(f"Settings updated: {safe_keys}")

    # Any model / provider / temperature change invalidates any cached
    # embedding / client state.
    if {"ollama_embedding_model", "ollama_base_url"} & payload.keys():
        _invalidate_embedding_cache()

    return new_snapshot


@router.get("/ollama-models")
def list_ollama_models() -> dict[str, Any]:
    """Query the local Ollama server for installed models."""
    try:
        client = ollama.Client(host=settings.ollama_base_url)
        models_response = client.list()
        models = []
        for m in getattr(models_response, "models", []):
            models.append({
                "name": getattr(m, "model", "") or "",
                "size": getattr(m, "size", 0) or 0,
                "modified_at": str(getattr(m, "modified_at", "")),
            })
        return {"models": models}
    except Exception as e:
        logger.warning(f"Failed to list Ollama models: {e}")
        return {"models": [], "error": str(e)}


_DEPRECATION_KEYWORDS = (
    "deprecated", "discontinued", "will be removed", "no longer",
    "legacy", "retire",
)


def _gemini_version_key(name: str) -> float:
    """Extract a numeric version from a model id (e.g. 'gemini-2.5-flash' → 2.5)."""
    m = re.search(r"(\d+)\.(\d+)", name)
    if m:
        try:
            return float(f"{m.group(1)}.{m.group(2)}")
        except ValueError:
            return 0.0
    return 0.0


def _gemini_family_rank(name: str) -> int:
    """Lower is better. Prefer flagship 'pro' / 'flash' over experimental / preview / tts variants."""
    n = name.lower()
    if "tts" in n or "audio" in n:
        return 5
    if "preview" in n or "experimental" in n or "exp" in n.split("-"):
        return 4
    if "lite" in n:
        return 3
    if "flash" in n:
        return 1
    if "pro" in n:
        return 0
    return 2


def _fetch_gemini_models_sync(key: str) -> dict[str, Any]:
    """Blocking Gemini model fetch — call via asyncio.to_thread."""
    if not key:
        return {"models": [], "error": "No Gemini API key configured"}

    try:
        all_models: list[dict[str, Any]] = []
        page_token: str | None = None
        # Cap iterations defensively in case the API misbehaves.
        for _ in range(10):
            params = {"pageSize": "200", "key": key}
            if page_token:
                params["pageToken"] = page_token
            url = "https://generativelanguage.googleapis.com/v1beta/models?" + urllib.parse.urlencode(params)
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            all_models.extend(data.get("models", []) or [])
            page_token = data.get("nextPageToken")
            if not page_token:
                break

        parsed: list[dict[str, Any]] = []
        for m in all_models:
            raw_name = m.get("name", "") or ""
            name = raw_name.removeprefix("models/")
            methods = m.get("supportedGenerationMethods", []) or []
            if "generateContent" not in methods:
                continue
            description = (m.get("description") or "").strip()
            desc_l = description.lower()
            deprecated = any(kw in desc_l for kw in _DEPRECATION_KEYWORDS)
            parsed.append({
                "name": name,
                "display_name": m.get("displayName") or name,
                "description": description,
                "input_token_limit": m.get("inputTokenLimit") or 0,
                "output_token_limit": m.get("outputTokenLimit") or 0,
                "version": m.get("version") or "",
                "deprecated": deprecated,
            })

        parsed.sort(key=lambda x: (
            x["deprecated"],
            -_gemini_version_key(x["name"]),
            _gemini_family_rank(x["name"]),
            x["name"],
        ))
        return {"models": parsed}
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="ignore")
        except Exception:
            body = ""
        logger.warning(f"Gemini ListModels HTTP {e.code}: {body[:300]}")
        return {"models": [], "error": f"HTTP {e.code}: {body[:200] or e.reason}"}
    except Exception as e:
        logger.warning(f"Gemini ListModels failed: {e}")
        return {"models": [], "error": str(e)}


@router.get("/gemini-models")
async def list_gemini_models(api_key: str | None = None) -> dict[str, Any]:
    """Fetch the live Gemini model catalog from Google's ListModels API."""
    key = (api_key or settings.get_secret("gemini_api_key") or "").strip()
    return await asyncio.to_thread(_fetch_gemini_models_sync, key)


# Hardcoded model lists for providers we surface in the UI but don't (yet)
# wire end-to-end. Gemini routes through the live API call above; everything
# else returns a curated list so the dropdown looks complete and the
# user can pick something without the form feeling broken.
_STATIC_PROVIDER_MODELS: dict[str, list[str]] = {
    "openai": ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo", "o1-mini", "o1"],
    "grok": ["grok-2-latest", "grok-2-mini", "grok-beta"],
    "mistral": ["mistral-large-latest", "mistral-small-latest", "mistral-medium-latest",
                "open-mistral-7b", "open-mixtral-8x7b", "open-mixtral-8x22b"],
}


@router.get("/llm-models")
async def list_llm_models(provider: str, api_key: str | None = None) -> dict[str, Any]:
    """Return the model list for the requested LLM provider.

    For Gemini, fetches live from Google's ListModels API using the supplied
    or stored key. For other providers we return a curated static list so the
    UI dropdown is populated even before the backend grows live support.
    """
    prov = (provider or "").lower().strip()
    if prov == "gemini":
        key = (api_key or settings.get_secret("gemini_api_key") or "").strip()
        return await asyncio.to_thread(_fetch_gemini_models_sync, key)
    if prov in _STATIC_PROVIDER_MODELS:
        return {
            "models": [{"name": m, "display_name": m, "description": "",
                        "input_token_limit": 0, "output_token_limit": 0,
                        "version": "", "deprecated": False}
                       for m in _STATIC_PROVIDER_MODELS[prov]],
            "static": True,
        }
    return {"models": [], "error": f"Unknown provider '{provider}'"}


@router.post("/test-provider")
def test_llm_provider(body: TestProviderRequest) -> dict[str, Any]:
    """Ping the given provider to validate credentials / reachability.

    Uses the request body's api_key / base_url when provided, otherwise
    falls back to the currently stored settings — so the UI can test
    without forcing the user to retype a saved key.
    """
    provider = (body.provider or "").lower()
    if provider not in SUPPORTED_LLM_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"provider must be one of {SUPPORTED_LLM_PROVIDERS}",
        )

    if provider == "openai":
        api_key = body.api_key or settings.get_secret("openai_api_key")
        model = body.model or settings.openai_model
        return _test_provider("openai", model=model, api_key=api_key)
    if provider == "gemini":
        slot = body.key_slot if body.key_slot in ("gemini_api_key", "fallback_api_key") else "gemini_api_key"
        api_key = body.api_key or settings.get_secret(slot)
        model = body.model or settings.gemini_model
        return _test_provider("gemini", model=model, api_key=api_key)

    # ollama
    base_url = body.base_url or settings.ollama_base_url
    model = body.model or settings.ollama_model
    return _test_provider("ollama", model=model, base_url=base_url)


# ── Cloud provider configuration endpoints ───────────────────


class CloudWatchConfig(BaseModel):
    access_key_id: str
    secret_access_key: str
    region: str = "us-east-1"
    instance_ids: list[str] = []
    log_groups: list[str] = ["/itops/ec2/syslog", "/itops/ec2/auth"]
    poll_interval_seconds: int = Field(default=30, ge=10, le=3600)


class AzureMonitorConfig(BaseModel):
    tenant_id: str
    client_id: str
    client_secret: str
    subscription_id: str
    resource_group: str = ""
    poll_interval_seconds: int = Field(default=30, ge=10, le=3600)


class GCPMonitoringConfig(BaseModel):
    project_id: str
    service_account_json: str
    zone: str = ""
    poll_interval_seconds: int = Field(default=30, ge=10, le=3600)


async def _connect_and_register(adapter, provider_name: str) -> dict:
    """Connect an adapter and register it for polling. Returns {ok, message, nodes_found}."""
    from app.data_sources.base import registry
    try:
        await adapter.connect()
        registry.register(adapter)
        _spawn_cloud_task(_poll_cloud_adapter(adapter))
        return {"ok": True, "message": f"Connected to {provider_name}", "nodes_found": 0}
    except Exception as exc:
        msg = str(exc)[:300]
        settings.update(**{f"{provider_name.lower().replace(' ', '_')}_status": "error",
                           f"{provider_name.lower().replace(' ', '_')}_error": msg})
        return {"ok": False, "message": msg, "nodes_found": 0}


@router.post("/cloudwatch")
async def configure_cloudwatch(body: CloudWatchConfig) -> dict:
    """Save AWS CloudWatch credentials, connect, and register the adapter."""
    settings.update(
        cloudwatch_access_key_id=body.access_key_id,
        cloudwatch_secret_access_key=body.secret_access_key,
        cloudwatch_region=body.region,
        cloudwatch_instance_ids=body.instance_ids,
        cloudwatch_log_groups=body.log_groups,
        cloudwatch_poll_interval_seconds=body.poll_interval_seconds,
    )
    from app.data_sources.cloudwatch import CloudWatchDataSource
    adapter = CloudWatchDataSource()
    try:
        await adapter.connect()
        from app.data_sources.base import registry
        registry.register(adapter)
        _spawn_cloud_task(_poll_cloud_adapter(adapter))
        return {"ok": True, "message": f"Connected to AWS CloudWatch (region={body.region})", "nodes_found": len(body.instance_ids)}
    except Exception as exc:
        msg = str(exc)[:300]
        settings.update(cloudwatch_status="error", cloudwatch_error=msg)
        return {"ok": False, "message": msg, "nodes_found": 0}


@router.post("/azure")
async def configure_azure(body: AzureMonitorConfig) -> dict:
    """Save Azure Monitor credentials, connect, and register the adapter."""
    settings.update(
        azure_tenant_id=body.tenant_id,
        azure_client_id=body.client_id,
        azure_client_secret=body.client_secret,
        azure_subscription_id=body.subscription_id,
        azure_resource_group=body.resource_group,
        azure_poll_interval_seconds=body.poll_interval_seconds,
    )
    from app.data_sources.azure_monitor import AzureMonitorDataSource
    adapter = AzureMonitorDataSource()
    try:
        await adapter.connect()
        from app.data_sources.base import registry
        registry.register(adapter)
        _spawn_cloud_task(_poll_cloud_adapter(adapter))
        return {"ok": True, "message": f"Connected to Azure Monitor (subscription={body.subscription_id})", "nodes_found": 0}
    except Exception as exc:
        msg = str(exc)[:300]
        settings.update(azure_status="error", azure_error=msg)
        return {"ok": False, "message": msg, "nodes_found": 0}


@router.post("/gcp")
async def configure_gcp(body: GCPMonitoringConfig) -> dict:
    """Save GCP credentials, connect, and register the adapter."""
    settings.update(
        gcp_project_id=body.project_id,
        gcp_service_account_json=body.service_account_json,
        gcp_zone=body.zone,
        gcp_poll_interval_seconds=body.poll_interval_seconds,
    )
    from app.data_sources.gcp_monitoring import GCPMonitoringDataSource
    adapter = GCPMonitoringDataSource()
    try:
        await adapter.connect()
        from app.data_sources.base import registry
        registry.register(adapter)
        _spawn_cloud_task(_poll_cloud_adapter(adapter))
        return {"ok": True, "message": f"Connected to GCP project {body.project_id}", "nodes_found": 0}
    except Exception as exc:
        msg = str(exc)[:300]
        settings.update(gcp_status="error", gcp_error=msg)
        return {"ok": False, "message": msg, "nodes_found": 0}


async def _poll_cloud_adapter(adapter) -> None:
    """Drive a cloud adapter's polling loop through the main _process_event path."""
    from app.main import _cloud_polling_loop
    await _cloud_polling_loop(adapter)


# ── Cache invalidation helpers ───────────────────────────────


def _invalidate_embedding_cache():
    """Reset the cached vector store so it picks up the new embedding model."""
    from app.memory import vector_store
    vector_store._memory_instance = None
    logger.info("Embedding cache invalidated — vector store will use the new model")
