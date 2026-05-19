from __future__ import annotations
"""
Institutional Memory System — ChromaDB vector store.

Uses ChromaDB (HNSW, cosine) with Ollama embeddings for semantic search.
Falls back to zero-vector storage when Ollama is unavailable so HNSW
index stays consistent; those entries rank last until re-indexed.
"""

import logging
import threading
from pathlib import Path

import chromadb
from chromadb import Settings as ChromaSettings

from app.config import CHROMA_PERSIST_DIR
from app.services.settings_service import settings as _settings

logger = logging.getLogger("itops.memory")

_EMBED_DIM = 768  # nomic-embed-text default; updated on first successful embed


class _OllamaEmbedFn(chromadb.EmbeddingFunction):
    """ChromaDB embedding function backed by Ollama."""

    def __call__(self, input: chromadb.Documents) -> chromadb.Embeddings:
        global _EMBED_DIM
        import ollama as _ol
        client = _ol.Client(host=_settings.ollama_base_url)
        model = _settings.ollama_embedding_model
        results: chromadb.Embeddings = []
        for text in input:
            try:
                resp = client.embed(model=model, input=text[:8000])
                emb = resp["embeddings"][0]
                _EMBED_DIM = len(emb)
                results.append(emb)
            except Exception as exc:
                logger.warning("Ollama embed unavailable (%s) — storing zero vector", exc)
                results.append([0.0] * _EMBED_DIM)
        return results


class InstitutionalMemory:
    """ChromaDB-backed vector store for incident knowledge and runbooks."""

    def __init__(self) -> None:
        persist_dir = Path(CHROMA_PERSIST_DIR)
        persist_dir.mkdir(parents=True, exist_ok=True)

        self._embed_fn = _OllamaEmbedFn()
        self._db = chromadb.PersistentClient(
            path=str(persist_dir),
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        self._incidents = self._db.get_or_create_collection(
            name="incidents",
            embedding_function=self._embed_fn,
            metadata={"hnsw:space": "cosine"},
        )
        self._runbooks = self._db.get_or_create_collection(
            name="runbooks",
            embedding_function=self._embed_fn,
            metadata={"hnsw:space": "cosine"},
        )
        self._lock = threading.RLock()

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
            f"Incident: {title}\nDescription: {description}\n"
            f"Root Cause: {root_cause}\nResolution: {resolution}\n"
            f"Severity: {severity}\nNode Type: {node_type}"
        )
        doc_id = f"incident-{incident_id}"
        meta = {"incident_id": incident_id, "severity": severity, "node_type": node_type}
        with self._lock:
            if self._incidents.get(ids=[doc_id])["ids"]:
                self._incidents.update(ids=[doc_id], documents=[doc], metadatas=[meta])
            else:
                self._incidents.add(ids=[doc_id], documents=[doc], metadatas=[meta])

    def store_runbook(
        self,
        runbook_id: int,
        title: str,
        problem_pattern: str,
        solution_steps: str,
    ) -> None:
        doc = f"Runbook: {title}\nProblem: {problem_pattern}\nSolution:\n{solution_steps}"
        doc_id = f"runbook-{runbook_id}"
        meta = {"runbook_id": runbook_id, "title": title}
        with self._lock:
            if self._runbooks.get(ids=[doc_id])["ids"]:
                self._runbooks.update(ids=[doc_id], documents=[doc], metadatas=[meta])
            else:
                self._runbooks.add(ids=[doc_id], documents=[doc], metadatas=[meta])

    def _search(self, collection: chromadb.Collection, query: str, n_results: int) -> list[dict]:
        count = collection.count()
        if count == 0:
            return []
        try:
            results = collection.query(
                query_texts=[query],
                n_results=min(n_results, count),
                include=["documents", "metadatas", "distances"],
            )
        except Exception as exc:
            logger.warning("ChromaDB query failed: %s", exc)
            return []

        return [
            {"document": doc, "metadata": meta, "distance": round(dist, 4)}
            for doc, meta, dist in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
            )
        ]

    def search_similar_incidents(self, query: str, n_results: int = 5) -> list[dict]:
        return self._search(self._incidents, query, n_results)

    def search_runbooks(self, query: str, n_results: int = 5) -> list[dict]:
        return self._search(self._runbooks, query, n_results)

    def persist(self) -> None:
        pass  # ChromaDB auto-persists on every write

    @property
    def incident_count(self) -> int:
        return self._incidents.count()

    @property
    def runbook_count(self) -> int:
        return self._runbooks.count()


_memory_instance: InstitutionalMemory | None = None
_memory_instance_lock = threading.Lock()


def get_memory() -> InstitutionalMemory:
    global _memory_instance
    if _memory_instance is None:
        with _memory_instance_lock:
            if _memory_instance is None:
                _memory_instance = InstitutionalMemory()
    return _memory_instance
