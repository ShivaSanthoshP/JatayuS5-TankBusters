"""
Runtime settings service — mutable, in-memory configuration store.

Allows the Settings UI to change models, toggle auto-run pipeline,
and set the pipeline interval without restarting the server.
"""

from __future__ import annotations

import threading
from typing import Any

from app.config import (
    OLLAMA_MODEL,
    OLLAMA_EMBEDDING_MODEL,
    OLLAMA_BASE_URL,
    AGENT_TEMPERATURE,
)


class _Settings:
    """Thread-safe singleton holding mutable runtime settings."""

    def __init__(self):
        self._lock = threading.RLock()

        # ── Model settings ──────────────────────────────────
        self.ollama_model: str = OLLAMA_MODEL
        self.ollama_embedding_model: str = OLLAMA_EMBEDDING_MODEL
        self.ollama_base_url: str = OLLAMA_BASE_URL
        self.agent_temperature: float = AGENT_TEMPERATURE

        # User-defined custom models that should appear in dropdowns
        self.custom_llm_models: list[str] = []
        self.custom_embedding_models: list[str] = []

        # ── Auto-run pipeline settings ──────────────────────
        self.auto_run_pipeline: bool = False
        self.auto_run_interval_seconds: int = 60  # default 60s

        # Monotonically increasing version counter so consumers
        # (e.g. cached LLM singletons) can detect config changes.
        self._version: int = 0

    # ── Getters ─────────────────────────────────────────────

    @property
    def version(self) -> int:
        return self._version

    def snapshot(self) -> dict[str, Any]:
        """Return a JSON-serialisable snapshot of current settings."""
        with self._lock:
            return {
                "ollama_model": self.ollama_model,
                "ollama_embedding_model": self.ollama_embedding_model,
                "ollama_base_url": self.ollama_base_url,
                "agent_temperature": self.agent_temperature,
                "custom_llm_models": list(self.custom_llm_models),
                "custom_embedding_models": list(self.custom_embedding_models),
                "auto_run_pipeline": self.auto_run_pipeline,
                "auto_run_interval_seconds": self.auto_run_interval_seconds,
            }

    # ── Setters ─────────────────────────────────────────────

    def update(self, **kwargs) -> dict[str, Any]:
        """Update one or more settings. Returns the new snapshot."""
        with self._lock:
            changed = False
            for key, value in kwargs.items():
                if hasattr(self, key) and not key.startswith("_"):
                    old = getattr(self, key)
                    if old != value:
                        setattr(self, key, value)
                        changed = True
            if changed:
                self._version += 1
            return self.snapshot()


# ── Module-level singleton ──────────────────────────────────

settings = _Settings()
