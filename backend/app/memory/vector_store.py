from __future__ import annotations
"""
Institutional Memory System — ChromaDB vector store.

Uses ChromaDB (HNSW, cosine) for storage and indexing.
Embedding provider is configurable at runtime: "google" (Gemini API)
or "ollama" (local). Reads the active setting on every embed call so
changes in the Settings UI take effect immediately without a restart.
"""

import logging
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from pathlib import Path

import chromadb
from chromadb import Settings as ChromaSettings

from app.config import CHROMA_PERSIST_DIR, EMBED_TIMEOUT_SECONDS
from app.services.settings_service import settings as _settings

logger = logging.getLogger("itops.memory")

_EMBED_DIM = 768  # updated on first successful embed

# A single embedding call must never block a request or background task
# indefinitely. If the configured provider is unreachable (missing API key,
# no local Ollama, blocked egress) the network call can hang forever; without
# a ceiling that exhausts the worker pool and freezes the whole API behind
# nginx (504). We run each provider call in a dedicated pool and abandon the
# caller after EMBED_TIMEOUT_SECONDS, degrading to a zero vector — the same
# graceful fallback already used for provider errors.
_embed_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="embed")


def _zero(input: chromadb.Documents) -> chromadb.Embeddings:
    return [[0.0] * _EMBED_DIM for _ in input]


class _DynamicEmbedFn(chromadb.EmbeddingFunction):
    """Routes to Google or Ollama based on the live embedding_provider setting.

    Every provider call is bounded by EMBED_TIMEOUT_SECONDS and fails fast to
    a zero vector so an unusable provider can never stall the application.
    """

    def __call__(self, input: chromadb.Documents) -> chromadb.Embeddings:
        provider = _settings.embedding_provider

        # Fail instantly (no network) when the provider is obviously unusable.
        if provider == "google" and not _settings.get_secret("gemini_api_key"):
            logger.warning(
                "Embedding provider is 'google' but no Gemini API key is set "
                "— storing zero vectors. Set a key or switch the embedding "
                "provider in Settings."
            )
            return _zero(input)
        if provider != "google" and not _settings.ollama_base_url:
            logger.warning("Ollama base URL is not set — storing zero vectors.")
            return _zero(input)

        compute = self._google if provider == "google" else self._ollama
        try:
            return _embed_pool.submit(compute, input).result(
                timeout=EMBED_TIMEOUT_SECONDS
            )
        except FuturesTimeout:
            logger.warning(
                "Embedding via '%s' exceeded %ss — storing zero vector. "
                "Provider is likely unreachable from this host.",
                provider, EMBED_TIMEOUT_SECONDS,
            )
            return _zero(input)
        except Exception as exc:
            logger.warning("Embedding via '%s' failed (%s) — storing zero vector",
                           provider, exc)
            return _zero(input)

    def _google(self, input: chromadb.Documents) -> chromadb.Embeddings:
        global _EMBED_DIM
        from google import genai
        client = genai.Client(api_key=_settings.get_secret("gemini_api_key"))
        model = _settings.gemini_embedding_model or "models/text-embedding-004"
        results: chromadb.Embeddings = []
        for text in input:
            resp = client.models.embed_content(model=model, contents=text[:8000])
            emb = resp.embeddings[0].values
            _EMBED_DIM = len(emb)
            results.append(list(emb))
        return results

    def _ollama(self, input: chromadb.Documents) -> chromadb.Embeddings:
        global _EMBED_DIM
        import ollama as _ol
        client = _ol.Client(host=_settings.ollama_base_url)
        model = _settings.ollama_embedding_model
        results: chromadb.Embeddings = []
        for text in input:
            resp = client.embed(model=model, input=text[:8000])
            emb = resp["embeddings"][0]
            _EMBED_DIM = len(emb)
            results.append(emb)
        return results


class InstitutionalMemory:
    """ChromaDB-backed vector store for incident knowledge and runbooks."""

    def __init__(self) -> None:
        persist_dir = Path(CHROMA_PERSIST_DIR)
        persist_dir.mkdir(parents=True, exist_ok=True)

        self._embed_fn = _DynamicEmbedFn()
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
