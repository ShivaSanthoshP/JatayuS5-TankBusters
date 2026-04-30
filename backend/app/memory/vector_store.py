from __future__ import annotations
"""
Institutional Memory System — lightweight vector store.

Uses Ollama embeddings + numpy cosine similarity for RAG.
Persists to a JSON file on disk. No C++ build tools required.
"""

import json
import logging
import os
import tempfile
import threading
from pathlib import Path

import numpy as np
import ollama

from app.config import CHROMA_PERSIST_DIR
from app.services.settings_service import settings as _settings

logger = logging.getLogger("itops.memory")


class InstitutionalMemory:
    """Vector store for incident knowledge and runbooks using Ollama embeddings."""

    def __init__(self):
        self._persist_dir = Path(CHROMA_PERSIST_DIR)
        self._persist_dir.mkdir(parents=True, exist_ok=True)
        self._incidents_path = self._persist_dir / "incidents.json"
        self._runbooks_path = self._persist_dir / "runbooks.json"

        # Guards both the in-memory lists and the on-disk JSON files. Calls
        # come in from asyncio.to_thread workers, so concurrent store/search
        # is real and the file write is not natively atomic.
        self._lock = threading.RLock()

        self._incidents: list[dict] = self._load(self._incidents_path)
        self._runbooks: list[dict] = self._load(self._runbooks_path)

        # Initialize Ollama client
        self._client = ollama.Client(host=_settings.ollama_base_url)

    @staticmethod
    def _load(path: Path) -> list[dict]:
        if path.exists():
            try:
                with open(path, "r") as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                return []
        return []

    def _save(self, path: Path, data: list[dict]) -> None:
        """Atomically persist the collection. Write to a temp file in the
        same directory, fsync, then os.replace — guarantees readers either
        see the old or new file, never a partial write."""
        try:
            fd, tmp_path = tempfile.mkstemp(
                prefix=path.name + ".",
                suffix=".tmp",
                dir=str(path.parent),
            )
            try:
                with os.fdopen(fd, "w") as f:
                    json.dump(data, f, indent=2, default=str)
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(tmp_path, path)
            except Exception:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
                raise
        except (IOError, OSError) as e:
            logger.error(f"Failed to persist memory: {e}")

    def _get_embedding(self, text: str) -> list[float] | None:
        if not self._client:
            return None
        try:
            response = self._client.embed(
                model=_settings.ollama_embedding_model,
                input=text[:8000],  # Truncate to reasonable limit
            )
            return response["embeddings"][0]
        except Exception as e:
            logger.warning(f"Embedding failed: {e}")
            return None

    @staticmethod
    def _cosine_similarity(a: list[float], b: list[float]) -> float:
        a_arr = np.array(a)
        b_arr = np.array(b)
        dot = np.dot(a_arr, b_arr)
        norm = np.linalg.norm(a_arr) * np.linalg.norm(b_arr)
        if norm == 0:
            return 0.0
        return float(dot / norm)

    def store_incident(
        self,
        incident_id: int,
        title: str,
        description: str,
        root_cause: str,
        resolution: str,
        severity: str,
        node_type: str,
    ) -> None:
        doc = (
            f"Incident: {title}\n"
            f"Description: {description}\n"
            f"Root Cause: {root_cause}\n"
            f"Resolution: {resolution}\n"
            f"Severity: {severity}\n"
            f"Node Type: {node_type}"
        )
        embedding = self._get_embedding(doc)

        with self._lock:
            # Upsert: replace if same incident_id exists
            self._incidents = [
                e for e in self._incidents if e.get("id") != f"incident-{incident_id}"
            ]
            self._incidents.append({
                "id": f"incident-{incident_id}",
                "document": doc,
                "embedding": embedding,
                "metadata": {
                    "incident_id": incident_id,
                    "severity": severity,
                    "node_type": node_type,
                },
            })
            self._save(self._incidents_path, self._incidents)

    def store_runbook(
        self,
        runbook_id: int,
        title: str,
        problem_pattern: str,
        solution_steps: str,
    ) -> None:
        doc = f"Runbook: {title}\nProblem: {problem_pattern}\nSolution:\n{solution_steps}"
        embedding = self._get_embedding(doc)

        with self._lock:
            self._runbooks = [
                e for e in self._runbooks if e.get("id") != f"runbook-{runbook_id}"
            ]
            self._runbooks.append({
                "id": f"runbook-{runbook_id}",
                "document": doc,
                "embedding": embedding,
                "metadata": {"runbook_id": runbook_id, "title": title},
            })
            self._save(self._runbooks_path, self._runbooks)

    def _search(self, collection: list[dict], persist_path: Path,
                query: str, n_results: int) -> list[dict]:
        if not collection:
            return []

        query_embedding = self._get_embedding(query)
        patched = False

        if query_embedding:
            # Cosine path. For any entry missing an embedding (e.g. seeded
            # while Ollama was down), lazily compute and persist one so
            # subsequent searches rank consistently on the same scale.
            scored = []
            for entry in collection:
                emb = entry.get("embedding")
                if not emb:
                    doc = entry.get("document", "")
                    if doc:
                        new_emb = self._get_embedding(doc)
                        if new_emb:
                            entry["embedding"] = new_emb
                            emb = new_emb
                            patched = True
                if emb:
                    sim = self._cosine_similarity(query_embedding, emb)
                    scored.append((sim, entry))
                else:
                    # Embedding service is up but failed for this doc —
                    # fall back to keyword for this single entry.
                    scored.append((self._keyword_score(query, entry.get("document", "")), entry))
            scored.sort(key=lambda x: x[0], reverse=True)
        else:
            # Pure keyword fallback when Ollama is unavailable.
            scored = [
                (self._keyword_score(query, entry.get("document", "")), entry)
                for entry in collection
            ]
            scored.sort(key=lambda x: x[0], reverse=True)

        if patched:
            with self._lock:
                self._save(persist_path, collection)

        return [
            {
                "document": entry.get("document", ""),
                "metadata": entry.get("metadata", {}),
                "distance": round(1.0 - score, 4),
            }
            for score, entry in scored[:n_results]
        ]

    @staticmethod
    def _keyword_score(query: str, document: str) -> float:
        """Simple keyword overlap score as fallback."""
        query_words = set(query.lower().split())
        doc_words = set(document.lower().split())
        if not query_words:
            return 0.0
        overlap = query_words & doc_words
        return len(overlap) / len(query_words)

    def search_similar_incidents(self, query: str, n_results: int = 5) -> list[dict]:
        # Snapshot under the lock so a concurrent store can't mutate the list
        # mid-iteration. Entry dicts are shared with the live list, so any
        # lazy re-embed performed inside _search is visible to future calls.
        with self._lock:
            collection = list(self._incidents)
        return self._search(collection, self._incidents_path, query, n_results)

    def search_runbooks(self, query: str, n_results: int = 5) -> list[dict]:
        with self._lock:
            collection = list(self._runbooks)
        return self._search(collection, self._runbooks_path, query, n_results)

    def persist(self) -> None:
        with self._lock:
            self._save(self._incidents_path, self._incidents)
            self._save(self._runbooks_path, self._runbooks)

    @property
    def incident_count(self) -> int:
        return len(self._incidents)

    @property
    def runbook_count(self) -> int:
        return len(self._runbooks)


# Singleton — guarded so concurrent asyncio.to_thread workers can't both
# construct separate instances on a cold start.
_memory_instance: InstitutionalMemory | None = None
_memory_instance_lock = threading.Lock()


def get_memory() -> InstitutionalMemory:
    global _memory_instance
    if _memory_instance is None:
        with _memory_instance_lock:
            if _memory_instance is None:
                _memory_instance = InstitutionalMemory()
    return _memory_instance
