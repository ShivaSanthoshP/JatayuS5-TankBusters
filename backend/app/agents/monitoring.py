from __future__ import annotations
"""
Monitoring Agent — anomaly detection.

Analyzes incoming metric snapshots to detect anomalies using
deterministic thresholds plus lightweight log correlation so
the pipeline can respond quickly without waiting on an LLM.
"""

import re

THRESHOLDS = {
    "cpu_percent": {"warning": 75, "high": 85, "critical": 95},
    "memory_percent": {"warning": 70, "high": 85, "critical": 95},
    "disk_percent": {"warning": 80, "high": 90, "critical": 95},
    "error_rate": {"warning": 2, "high": 5, "critical": 15},
    "latency_ms": {"warning": 100, "high": 500, "critical": 2000},
    "network_in_mbps": {"warning": 800, "high": 900, "critical": 950},
}

SEVERITY_RANK = {"low": 0, "medium": 1, "high": 2, "critical": 3}

NO_LOG_HISTORY_MARKERS = {
    "",
    "No logs available",
    "No logs available.",
    "No recent logs available",
    "No recent logs available.",
}

METRIC_LABELS = {
    "cpu_percent": "CPU",
    "memory_percent": "memory",
    "disk_percent": "disk",
    "network_in_mbps": "network ingress",
    "error_rate": "error rate",
    "latency_ms": "latency",
}

LOG_ANOMALY_PATTERNS = [
    {
        "pattern": re.compile(r"oom|outofmemory|heap space|oom killer|memory limit", re.IGNORECASE),
        "anomaly_type": "memory_leak",
        "severity": "critical",
    },
    {
        "pattern": re.compile(r"cpu .*quota exceeded|soft lockup|thread pool exhausted|runaway process", re.IGNORECASE),
        "anomaly_type": "cpu_spike",
        "severity": "high",
    },
    {
        "pattern": re.compile(r"no space left on device|disk full|wal file|filesystem .* full", re.IGNORECASE),
        "anomaly_type": "disk_full",
        "severity": "critical",
    },
    {
        "pattern": re.compile(r"syn flood|conntrack|buffer overflow|too many open files|network buffer exhausted", re.IGNORECASE),
        "anomaly_type": "network_saturation",
        "severity": "high",
    },
    {
        "pattern": re.compile(r"pool exhausted|connection slots|timeout waiting for idle connection|max_client_conn", re.IGNORECASE),
        "anomaly_type": "connection_pool_exhaustion",
        "severity": "high",
    },
    {
        "pattern": re.compile(r"cascading failure|circuit breaker open|502 bad gateway|503|no live upstreams|retry budget exhausted", re.IGNORECASE),
        "anomaly_type": "cascading_failure",
        "severity": "critical",
    },
]

LOG_LEVEL_SEVERITY = {
    "WARN": "medium",
    "WARNING": "medium",
    "ERROR": "high",
    "CRITICAL": "critical",
    "FATAL": "critical",
    "PANIC": "critical",
}


def statistical_anomaly_check(metrics: dict) -> dict:
    """Fast threshold-based anomaly check."""
    anomalies = []
    max_severity = "low"

    for metric_key, thresholds in THRESHOLDS.items():
        value = metrics.get(metric_key, 0)
        for level in ["critical", "high", "warning"]:
            if value >= thresholds[level]:
                sev = "critical" if level == "critical" else ("high" if level == "high" else "medium")
                anomalies.append({"metric": metric_key, "value": value, "severity": sev})
                if SEVERITY_RANK.get(sev, 0) > SEVERITY_RANK.get(max_severity, 0):
                    max_severity = sev
                break

    if not anomalies:
        return {"is_anomaly": False, "max_severity": None, "anomalies": []}

    return {
        "is_anomaly": True,
        "anomalies": anomalies,
        "max_severity": max_severity,
    }


def _max_severity(*severities: str | None) -> str | None:
    valid = [s for s in severities if s in SEVERITY_RANK]
    if not valid:
        return None
    return max(valid, key=lambda sev: SEVERITY_RANK[sev])


def _metric_anomaly_type(metric_key: str) -> str:
    return {
        "cpu_percent": "cpu_spike",
        "memory_percent": "memory_leak",
        "disk_percent": "disk_full",
        "network_in_mbps": "network_saturation",
        "error_rate": "error_spike",
        "latency_ms": "latency_degradation",
    }.get(metric_key, "threshold_breach")


def _primary_metric_anomaly(metric_result: dict) -> str | None:
    anomalies = metric_result.get("anomalies", [])
    if not anomalies:
        return None
    top = max(
        anomalies,
        key=lambda item: (
            SEVERITY_RANK.get(item.get("severity", "low"), 0),
            item.get("value", 0),
        ),
    )
    return _metric_anomaly_type(top.get("metric", ""))


def _clean_log_lines(log_history: str) -> list[str]:
    if not log_history or log_history.strip() in NO_LOG_HISTORY_MARKERS:
        return []
    return [line.strip() for line in log_history.splitlines() if line.strip()]


def log_anomaly_check(log_history: str) -> dict:
    """Lightweight log-based anomaly detection."""
    lines = _clean_log_lines(log_history)
    if not lines:
        return {
            "is_anomaly": False,
            "max_severity": None,
            "anomaly_type": None,
            "matched_patterns": [],
            "evidence": [],
        }

    matched_patterns = []
    evidence: list[str] = []
    level_severity: str | None = None

    for line in lines:
        upper = line.upper()
        for level, sev in LOG_LEVEL_SEVERITY.items():
            if level in upper:
                level_severity = _max_severity(level_severity, sev)
                if line not in evidence:
                    evidence.append(line)
                break

        for pattern in LOG_ANOMALY_PATTERNS:
            if pattern["pattern"].search(line):
                matched_patterns.append({
                    "anomaly_type": pattern["anomaly_type"],
                    "severity": pattern["severity"],
                    "line": line,
                })
                if line not in evidence:
                    evidence.append(line)

    pattern_severity = _max_severity(*(match["severity"] for match in matched_patterns))
    max_severity = _max_severity(level_severity, pattern_severity)
    is_anomaly = max_severity is not None and max_severity != "low"

    anomaly_type = None
    if matched_patterns:
        top_match = max(
            matched_patterns,
            key=lambda item: SEVERITY_RANK.get(item["severity"], 0),
        )
        anomaly_type = top_match["anomaly_type"]
    elif is_anomaly:
        anomaly_type = "log_anomaly"

    return {
        "is_anomaly": is_anomaly,
        "max_severity": max_severity,
        "anomaly_type": anomaly_type,
        "matched_patterns": matched_patterns,
        "evidence": evidence[:5],
    }


def _refine_anomaly_type(metric_result: dict, log_result: dict, metrics: dict) -> str:
    log_type = log_result.get("anomaly_type")
    if log_type and log_type != "log_anomaly":
        return log_type

    if metrics.get("memory_percent", 0) >= 85:
        return "memory_leak"
    if metrics.get("disk_percent", 0) >= 90:
        return "disk_full"
    if metrics.get("network_in_mbps", 0) >= 900:
        return "network_saturation"
    if metrics.get("latency_ms", 0) >= 500 and metrics.get("error_rate", 0) >= 5:
        return "cascading_failure"
    if metrics.get("latency_ms", 0) >= 500:
        return "latency_degradation"
    if metrics.get("error_rate", 0) >= 5:
        return "error_spike"
    return _primary_metric_anomaly(metric_result) or "threshold_breach"


def _build_description(
    metric_result: dict,
    log_result: dict,
    anomaly_type: str,
) -> str:
    parts = []

    anomalies = metric_result.get("anomalies", [])
    if anomalies:
        metric_summary = ", ".join(
            f"{METRIC_LABELS.get(entry['metric'], entry['metric'])}={entry['value']}"
            for entry in anomalies[:3]
        )
        parts.append(f"Metric pressure detected on {metric_summary}.")

    evidence = log_result.get("evidence", [])
    if evidence:
        parts.append(f"Logs show {evidence[0]}")

    if not parts:
        parts.append(f"{anomaly_type.replace('_', ' ')} indicators detected.")

    return " ".join(parts)


def _reasoning_summary(precheck: dict) -> str:
    sources = precheck.get("sources", [])
    if sources == ["metrics", "logs"] or set(sources) == {"metrics", "logs"}:
        return "Issue confirmed by both metric threshold breaches and supporting log evidence."
    if sources == ["logs"]:
        return "Issue classified from recent warning/error log patterns."
    return "Issue classified from current metric threshold breaches."


def preliminary_monitoring_check(metrics: dict, log_history: str = "No logs available") -> dict:
    """
    Combined precheck across both metrics and logs.

    This keeps the fast path cheap while ensuring the pipeline can trigger
    from either signal source when only one is available.
    """
    metric_result = statistical_anomaly_check(metrics)
    log_result = log_anomaly_check(log_history)

    sources = []
    if metric_result.get("is_anomaly"):
        sources.append("metrics")
    if log_result.get("is_anomaly"):
        sources.append("logs")

    if not sources:
        return {
            "is_anomaly": False,
            "max_severity": None,
            "anomaly_type": None,
            "sources": [],
            "affected_metrics": [],
            "log_evidence": "",
            "description": "All available metrics and logs appear normal.",
            "metrics_check": metric_result,
            "log_check": log_result,
        }

    max_severity = _max_severity(
        metric_result.get("max_severity"),
        log_result.get("max_severity"),
    )
    anomaly_type = _refine_anomaly_type(metric_result, log_result, metrics)
    affected_metrics = [entry["metric"] for entry in metric_result.get("anomalies", [])]
    log_evidence = " | ".join(log_result.get("evidence", []))

    return {
        "is_anomaly": True,
        "max_severity": max_severity,
        "anomaly_type": anomaly_type,
        "sources": sources,
        "affected_metrics": affected_metrics,
        "log_evidence": log_evidence,
        "description": _build_description(metric_result, log_result, anomaly_type),
        "metrics_check": metric_result,
        "log_check": log_result,
    }


async def analyze_metrics(metrics: dict, log_history: str = "No logs available") -> dict:
    """Return a deterministic anomaly analysis from metrics and logs."""
    precheck = preliminary_monitoring_check(metrics, log_history)
    if not precheck["is_anomaly"]:
        return {
            "is_anomaly": False,
            "anomaly_type": None,
            "severity": None,
            "description": precheck["description"],
            "affected_metrics": [],
            "log_evidence": "",
            "agent": "monitoring",
            "statistical_check": precheck["metrics_check"],
            "log_check": precheck["log_check"],
            "combined_precheck": precheck,
            "detection_sources": [],
            "reasoning": "No abnormal metric or log signal was found.",
        }

    result = {
        "is_anomaly": True,
        "anomaly_type": precheck["anomaly_type"],
        "severity": precheck["max_severity"],
        "description": precheck["description"],
        "affected_metrics": precheck["affected_metrics"],
        "log_evidence": precheck["log_evidence"] or "No structured log evidence available.",
        "agent": "monitoring",
        "statistical_check": precheck["metrics_check"],
        "log_check": precheck["log_check"],
        "combined_precheck": precheck,
        "detection_sources": precheck["sources"],
        "reasoning": _reasoning_summary(precheck),
    }
    return result
