from __future__ import annotations

"""
Diagnostic Agent — root cause analysis.

Performs fast deterministic reasoning by looking up canonical runbooks in
the database (seeded via `scripts/seed_runbooks.py`) and pulling additional
context from the vector store. Falls back to the configured LLM when the
issue type has no seeded runbook.
"""

import asyncio
import logging

from app.database.models import RunbookEntry
from app.database.session import SessionLocal
from app.memory.vector_store import get_memory

logger = logging.getLogger("itops.diagnostic")


METRIC_LABELS = {
    "cpu_percent": "CPU",
    "memory_percent": "memory",
    "disk_percent": "disk",
    "network_in_mbps": "network ingress",
    "error_rate": "error rate",
    "latency_ms": "latency",
}


def _load_profile(issue_type: str) -> dict | None:
    """Look up a seeded runbook by issue_type and return a diagnostic profile."""
    db = SessionLocal()
    try:
        entry = (
            db.query(RunbookEntry)
            .filter(RunbookEntry.issue_type == issue_type)
            .one_or_none()
        )
        if not entry or not entry.root_cause:
            return None
        return {
            "root_cause": entry.root_cause,
            "causal_chain": entry.causal_chain or [],
            "blast_radius": entry.blast_radius or [],
            "blast_radius_severity": entry.blast_radius_severity or "medium",
            "recommended_actions": entry.recommended_actions or [],
        }
    finally:
        db.close()


def _extract_reason_lines(anomaly_data: dict, prediction_data: dict, metrics: dict) -> list[str]:
    reasons: list[str] = []

    metric_check = anomaly_data.get("statistical_check") or anomaly_data.get("combined_precheck", {}).get("metrics_check", {})
    for entry in metric_check.get("anomalies", [])[:4]:
        metric = entry.get("metric")
        value = entry.get("value")
        severity = entry.get("severity")
        if metric and value is not None:
            reasons.append(
                f"{METRIC_LABELS.get(metric, metric)} is at {value} ({severity} threshold breach)."
            )

    log_evidence = anomaly_data.get("log_evidence", "")
    if log_evidence:
        for line in log_evidence.split(" | ")[:3]:
            reasons.append(f"Log evidence: {line}")

    failure_probability = prediction_data.get("failure_probability")
    if isinstance(failure_probability, (int, float)) and failure_probability >= 0.7:
        reasons.append(
            f"Predicted failure probability is {round(failure_probability * 100)}%, so the issue is likely to escalate quickly."
        )

    estimated_time_to_failure = prediction_data.get("estimated_time_to_failure")
    if estimated_time_to_failure:
        reasons.append(
            f"Estimated time to failure is about {estimated_time_to_failure} minutes without intervention."
        )

    if not reasons and anomaly_data.get("description"):
        reasons.append(anomaly_data["description"])

    return reasons[:5]


async def _similar_context(query: str) -> tuple[str, bool]:
    memory = get_memory()
    similar, runbooks = await asyncio.gather(
        asyncio.to_thread(memory.search_similar_incidents, query, 3),
        asyncio.to_thread(memory.search_runbooks, query, 2),
    )

    chunks: list[str] = []
    if similar:
        chunks.append("Similar incidents:")
        for entry in similar:
            chunks.append(f"- {entry['document'][:220]}")
    if runbooks:
        chunks.append("Relevant runbooks:")
        for entry in runbooks:
            chunks.append(f"- {entry['document'][:220]}")

    if not chunks:
        return "No similar past incidents found.", False
    return "\n".join(chunks), True


async def diagnose(
    anomaly_data: dict,
    prediction_data: dict,
    metrics: dict,
    log_history: str = "No logs available",
) -> dict:
    """Root cause analysis using DB-backed runbooks plus vector memory lookup.

    If a seeded runbook matches `issue_type`, its structured profile is
    used. Otherwise the configured LLM (e.g. gemma3:4b) is called.
    """
    anomaly_type = anomaly_data.get("anomaly_type") or "error_spike"

    query = (
        f"{anomaly_type} on {metrics.get('node_type', 'server')} "
        f"- {anomaly_data.get('description', '')}"
    )

    # Run profile lookup and RAG context fetch concurrently. If either
    # raises, cancel the sibling so we don't leak a pending task.
    profile_task = asyncio.ensure_future(asyncio.to_thread(_load_profile, anomaly_type))
    context_task = asyncio.ensure_future(_similar_context(query))
    try:
        profile = await profile_task
        past_context, used_rag = await context_task
    except BaseException:
        for t in (profile_task, context_task):
            if not t.done():
                t.cancel()
        # Drain cancellations so they don't surface as unhandled exceptions.
        await asyncio.gather(profile_task, context_task, return_exceptions=True)
        raise

    reasons = _extract_reason_lines(anomaly_data, prediction_data, metrics)

    generated_locally = profile is not None
    if profile is None:
        try:
            from app.agents.llm_fallback import llm_diagnose
            llm_profile = await llm_diagnose(
                anomaly_type=anomaly_type,
                metrics=metrics,
                log_evidence=anomaly_data.get("log_evidence", ""),
                reasons=reasons,
                past_context=past_context,
            )
            if llm_profile:
                profile = llm_profile
            else:
                profile = await asyncio.to_thread(_load_profile, "error_spike")
                generated_locally = profile is not None
        except Exception as e:
            logger.warning(f"LLM diagnostic fallback failed: {e}")
            profile = await asyncio.to_thread(_load_profile, "error_spike")
            generated_locally = profile is not None

    if profile is None:
        # No seeded runbooks AND no LLM — degraded diagnostic.
        profile = {
            "root_cause": "Unknown — no runbook seeded and LLM fallback unavailable.",
            "causal_chain": [],
            "blast_radius": [],
            "blast_radius_severity": "medium",
            "recommended_actions": [],
        }
        generated_locally = False

    confidence = 0.55
    if reasons:
        confidence += 0.1
    if anomaly_data.get("severity") in {"high", "critical"}:
        confidence += 0.1
    if used_rag:
        confidence += 0.05
    if not generated_locally:
        confidence = max(confidence - 0.05, 0.40)

    reasoning = (
        f"Classified as {anomaly_type.replace('_', ' ')} based on current metric pressure, "
        f"log evidence, and previously stored incident patterns."
    )
    if not generated_locally:
        reasoning += " Root cause analysis was generated by the LLM because no seeded runbook matched."

    return {
        "root_cause": profile["root_cause"],
        "issue_type": anomaly_type,
        "reasons": reasons,
        "causal_chain": profile["causal_chain"],
        "blast_radius": profile["blast_radius"],
        "blast_radius_severity": profile.get("blast_radius_severity", "medium"),
        "confidence": round(min(confidence, 0.95), 2),
        "recommended_actions": profile["recommended_actions"],
        "similar_past_incidents": past_context,
        "reasoning": reasoning,
        "fix_summary": "; ".join(action["action"] for action in profile["recommended_actions"][:2]),
        "agent": "diagnostic",
        "rag_context_used": used_rag,
        "generated_locally": generated_locally,
    }
