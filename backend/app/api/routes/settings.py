"""Settings API — read/update runtime configuration from the UI."""

from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

import ollama
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.settings_service import settings, SUPPORTED_LLM_PROVIDERS
from app.llm.provider import test_provider as _test_provider

logger = logging.getLogger("itops.settings")

router = APIRouter(prefix="/settings", tags=["Settings"])


# ── Pydantic models ─────────────────────────────────────────


class SettingsUpdate(BaseModel):
    # Provider selection — exactly one of: ollama | openai | gemini.
    llm_provider: str | None = None

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

    # Shared
    agent_temperature: float | None = None
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


@router.get("/gemini-models")
def list_gemini_models(api_key: str | None = None) -> dict[str, Any]:
    """Fetch the live Gemini model catalog from Google's ListModels API.

    Returns each chat-capable model with display name, token limits, and a
    `deprecated` flag derived from the model's description. Sort order:
    usable models first (deprecated last), then by version desc, then by
    family rank (pro/flash before lite/preview/tts), then alphabetical.
    """
    snapshot = settings.snapshot(include_secrets=True)
    key = (api_key or snapshot.get("gemini_api_key") or "").strip()
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

    snapshot = settings.snapshot(include_secrets=True)
    if provider == "openai":
        api_key = body.api_key or snapshot["openai_api_key"]
        model = body.model or snapshot["openai_model"]
        return _test_provider("openai", model=model, api_key=api_key)
    if provider == "gemini":
        api_key = body.api_key or snapshot["gemini_api_key"]
        model = body.model or snapshot["gemini_model"]
        return _test_provider("gemini", model=model, api_key=api_key)

    # ollama
    base_url = body.base_url or snapshot["ollama_base_url"]
    model = body.model or snapshot["ollama_model"]
    return _test_provider("ollama", model=model, base_url=base_url)


# ── Cache invalidation helpers ───────────────────────────────


def _invalidate_embedding_cache():
    """Reset the cached vector store so it picks up the new embedding model."""
    from app.memory import vector_store
    vector_store._memory_instance = None
    logger.info("Embedding cache invalidated — vector store will use the new model")
