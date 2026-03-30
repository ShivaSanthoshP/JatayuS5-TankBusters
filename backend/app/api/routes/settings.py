"""Settings API — read/update runtime configuration from the UI."""

from __future__ import annotations

import logging
from typing import Any

import ollama
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.settings_service import settings

logger = logging.getLogger("itops.settings")

router = APIRouter(prefix="/settings", tags=["Settings"])


# ── Pydantic models ─────────────────────────────────────────

class SettingsUpdate(BaseModel):
    ollama_model: str | None = None
    ollama_embedding_model: str | None = None
    ollama_base_url: str | None = None
    agent_temperature: float | None = None
    custom_llm_models: list[str] | None = None
    custom_embedding_models: list[str] | None = None
    auto_run_pipeline: bool | None = None
    auto_run_interval_seconds: int | None = None


# ── Endpoints ────────────────────────────────────────────────

@router.get("/")
def get_settings() -> dict[str, Any]:
    """Return the current runtime settings."""
    return settings.snapshot()


@router.put("/")
def update_settings(body: SettingsUpdate) -> dict[str, Any]:
    """Update one or more runtime settings.

    Changing the model invalidates cached LLM singletons so the next
    agent call will create a fresh ChatOllama with the new model.
    """
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="No settings provided")

    new_snapshot = settings.update(**payload)
    logger.info(f"Settings updated: {list(payload.keys())}")

    # Invalidate cached LLM singletons when model changes
    if "ollama_model" in payload or "agent_temperature" in payload or "ollama_base_url" in payload:
        _invalidate_llm_caches()

    if "ollama_embedding_model" in payload or "ollama_base_url" in payload:
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


# ── Cache invalidation helpers ───────────────────────────────

def _invalidate_llm_caches():
    """Reset the cached LLM singleton in every agent module."""
    from app.agents import monitoring, predictive, diagnostic, remediation, reporting
    for mod in (monitoring, predictive, diagnostic, remediation, reporting):
        mod._llm = None
    logger.info("LLM caches invalidated — agents will use the new model on next call")


def _invalidate_embedding_cache():
    """Reset the cached vector store so it picks up the new embedding model."""
    from app.memory import vector_store
    vector_store._memory_instance = None
    logger.info("Embedding cache invalidated — vector store will use the new model")
