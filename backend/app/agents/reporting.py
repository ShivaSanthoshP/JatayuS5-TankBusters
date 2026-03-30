from __future__ import annotations

"""
Reporting Agent — incident summarization and runbook generation.

This stage intentionally avoids an extra LLM round-trip so the
pipeline can finish quickly once remediation planning is complete.
"""

import re


def _clean_text(value: str | None, fallback: str) -> str:
    text = re.sub(r"\s+", " ", (value or "").strip())
    return text or fallback


def _titleize_anomaly(anomaly_type: str | None) -> str:
    raw = (anomaly_type or "incident").replace("_", " ").strip()
    return raw.title() if raw else "Incident"


def _build_runbook_title(node_name: str, anomaly_type: str | None, root_cause: str | None) -> str:
    anomaly = _titleize_anomaly(anomaly_type)
    cause = _clean_text(root_cause, "")
    if cause and cause.lower() != "n/a":
        return f"{anomaly} on {node_name}: {cause[:80]}"
    return f"{anomaly} on {node_name}"


def _build_executive_summary(
    node_name: str,
    severity: str,
    anomaly_type: str | None,
    root_cause: str | None,
    remediation_summary: str | None,
    predicted_impact: str | None,
    outcome: str,
) -> str:
    anomaly = (anomaly_type or "incident").replace("_", " ")
    cause = _clean_text(root_cause, "root cause requires review")
    remediation = _clean_text(remediation_summary, "manual remediation planning")
    impact = _clean_text(predicted_impact, "")

    summary = (
        f"{severity.title()} {anomaly} detected on {node_name}. "
        f"Most likely root cause: {cause}. "
        f"Recommended response: {remediation}."
    )
    if impact:
        summary += f" Expected impact if untreated: {impact}."
    if outcome:
        summary += f" Current outcome: {outcome}."
    return summary


async def generate_report(
    monitoring_data: dict,
    prediction_data: dict,
    diagnostic_data: dict,
    remediation_data: dict,
    metrics: dict,
    outcome: str = "resolved",
    log_history: str = "No logs available",
) -> dict:
    """Generate a concise incident report without blocking on the model."""
    node_name = metrics.get("node_name", "unknown")
    severity = monitoring_data.get("severity") or "medium"
    anomaly_type = monitoring_data.get("anomaly_type")
    root_cause = diagnostic_data.get("root_cause")
    remediation_summary = remediation_data.get("plan_summary")
    predicted_impact = prediction_data.get("predicted_impact")

    result = {
        "executive_summary": _build_executive_summary(
            node_name=node_name,
            severity=severity,
            anomaly_type=anomaly_type,
            root_cause=root_cause,
            remediation_summary=remediation_summary,
            predicted_impact=predicted_impact,
            outcome=outcome,
        ),
        "runbook_title": _build_runbook_title(
            node_name=node_name,
            anomaly_type=anomaly_type,
            root_cause=root_cause,
        ),
        "generated_locally": True,
    }

    result["agent"] = "reporting"
    return result
