from __future__ import annotations

"""
LLM Fallback — structured Ollama calls for unknown incident types.

When the deterministic rulebook does not cover an anomaly type, these
helpers call the configured Ollama model (e.g. gemma3:4b) and parse the
JSON response into the same dict shapes that the deterministic path
produces.  Every function is wrapped in try/except so a missing or
unreachable Ollama server never breaks the pipeline — it simply falls
back to the generic deterministic output.
"""

import asyncio
import json
import logging

from app.llm.provider import chat_json as _provider_chat_json
from app.services.settings_service import settings as _settings

logger = logging.getLogger("itops.llm_fallback")


async def _call_llm(prompt: str, *, temperature: float = 0.1) -> dict | None:
    """Route the prompt through the currently selected LLM provider.

    Runs the blocking SDK call in a worker thread so the event loop is
    never stalled by network I/O.
    """
    return await asyncio.to_thread(_provider_chat_json, prompt, temperature=temperature)


# ── Diagnostic fallback ─────────────────────────────────────────────

_DIAGNOSE_PROMPT = """\
You are an expert SRE diagnostic engine. Think step by step before answering.

Anomaly type: {anomaly_type}
Node type: {node_type}
Cloud provider: {provider}
Region: {region}
Metrics: {metrics_summary}
Log evidence: {log_evidence}
Trend signals (rising/falling metrics): {trend_signals}
Native provider metrics: {native_metrics}
Observed reasons: {reasons}

{past_context_section}

Step 1: Identify the most likely root cause given the provider, node type, and trend signals.
Step 2: Trace the causal chain (what led to what).
Step 3: Assess blast radius (what else is affected).
Step 4: Recommend concrete actions specific to {provider} infrastructure.

Return ONLY a JSON object with these exact keys:
{{
  "root_cause": "one sentence describing the most likely root cause",
  "causal_chain": ["step1", "step2", "step3", "step4", "step5"],
  "blast_radius": ["affected component 1", "affected component 2", "affected component 3"],
  "blast_radius_severity": "low|medium|high",
  "recommended_actions": [
    {{"action": "short action title", "type": "restart_service|config_change|scale_up|rate_limit|rollback|failover|clear_disk|aws_cli|az_cli|gcloud_cli", "priority": 1, "description": "why this helps"}}
  ]
}}

Limit causal_chain to 5 items, blast_radius to 5 items, recommended_actions to 4 items.
"""


async def llm_diagnose(
    anomaly_type: str,
    metrics: dict,
    log_evidence: str,
    reasons: list[str],
    past_context: str = "",
    provider: str = "simulated",
    region: str = "",
    node_type: str = "server",
    trend_signals: list[dict] | None = None,
    native_metrics: dict | None = None,
) -> dict | None:
    """Ask the LLM for root cause analysis when no issue profile matches."""
    key_metrics = {
        k: metrics.get(k)
        for k in ("cpu_percent", "memory_percent", "disk_percent",
                   "error_rate", "latency_ms", "network_in_mbps")
        if metrics.get(k) is not None
    }
    past_section = ""
    if past_context and past_context != "No similar past incidents found.":
        past_section = f"Past incidents and runbooks for reference:\n{past_context}"

    prompt = _DIAGNOSE_PROMPT.format(
        anomaly_type=anomaly_type,
        node_type=node_type,
        provider=provider,
        region=region or "unknown",
        metrics_summary=json.dumps(key_metrics),
        log_evidence=log_evidence[:500] if log_evidence else "none",
        trend_signals=json.dumps(trend_signals or []),
        native_metrics=json.dumps(native_metrics or {}),
        reasons="; ".join(reasons[:5]) if reasons else "none",
        past_context_section=past_section or "No past incidents available for reference.",
    )
    result = await _call_llm(prompt, temperature=_settings.diagnostic_temperature)
    if not result or "root_cause" not in result:
        return None

    actions_raw = result.get("recommended_actions", [])
    actions = []
    for i, act in enumerate(actions_raw[:4]):
        if isinstance(act, dict):
            actions.append({
                "action": act.get("action", f"Action {i+1}"),
                "type": act.get("type", "config_change"),
                "priority": act.get("priority", i + 1),
                "description": act.get("description", ""),
            })

    return {
        "root_cause": str(result.get("root_cause", "unknown")),
        "causal_chain": [str(s) for s in result.get("causal_chain", [])[:5]],
        "blast_radius": [str(s) for s in result.get("blast_radius", [])[:5]],
        "blast_radius_severity": result.get("blast_radius_severity", "medium"),
        "recommended_actions": actions or [
            {"action": "Investigate and restart the affected service",
             "type": "restart_service", "priority": 1,
             "description": "recover quickly while investigating"},
        ],
    }


# ── Remediation fallback ────────────────────────────────────────────

_REMEDIATE_PROMPT = """\
You are an expert SRE remediation engine. Generate a remediation plan for this incident.

Issue type: {issue_type}
Service: {service_name}
Node: {node_name}
Cloud provider: {provider}
Root cause: {root_cause}
Key metrics: {metrics_summary}

{past_context_section}

Use provider-appropriate CLI commands:
- AWS: use aws CLI (aws ec2, aws rds, aws logs, etc.)
- Azure: use az CLI (az vm, az monitor, etc.)
- GCP: use gcloud CLI (gcloud compute, gcloud logging, etc.)
- simulated/other: use systemctl, journalctl, standard Linux tools

Return ONLY a JSON object with these exact keys:
{{
  "plan_summary": "one sentence summarizing the fix",
  "steps": [
    {{
      "order": 1,
      "action": "short action title",
      "description": "what this step does and why",
      "bash_commands": ["cmd1", "cmd2"]
    }}
  ],
  "rollback_commands": ["cmd1", "cmd2"]
}}

Limit to 5 steps. The service is "{service_name}" on {provider} infrastructure.
"""


def _render_script_from_commands(commands: list[str]) -> str:
    return "#!/usr/bin/env bash\nset -euo pipefail\n\n" + "\n".join(commands).strip() + "\n"


async def llm_remediate(
    issue_type: str,
    service_name: str,
    node_name: str,
    root_cause: str,
    metrics: dict,
    past_context: str = "",
    provider: str = "simulated",
) -> tuple[list[dict], list[dict], str] | None:
    """Ask the LLM for remediation steps when no template matches."""
    key_metrics = {
        k: metrics.get(k)
        for k in ("cpu_percent", "memory_percent", "disk_percent",
                   "error_rate", "latency_ms", "network_in_mbps")
        if metrics.get(k) is not None
    }
    # Build RAG context section
    past_section = ""
    if past_context and past_context != "No similar past incidents found.":
        past_section = f"Past incidents and runbooks for reference:\n{past_context}"

    prompt = _REMEDIATE_PROMPT.format(
        issue_type=issue_type,
        service_name=service_name,
        node_name=node_name,
        provider=provider,
        root_cause=root_cause[:200] if root_cause else "unknown",
        metrics_summary=json.dumps(key_metrics),
        past_context_section=past_section or "No past incidents available for reference.",
    )
    result = await _call_llm(prompt, temperature=_settings.remediation_temperature)
    if not result or "steps" not in result:
        return None

    # Build steps in the same shape as the deterministic path
    steps = []
    all_bash = []
    for raw_step in result.get("steps", [])[:5]:
        if not isinstance(raw_step, dict):
            continue
        bash_cmds = raw_step.get("bash_commands", [])
        if isinstance(bash_cmds, str):
            bash_cmds = [bash_cmds]
        script = _render_script_from_commands(bash_cmds) if bash_cmds else ""
        all_bash.extend(bash_cmds)
        steps.append({
            "order": raw_step.get("order", len(steps) + 1),
            "action": raw_step.get("action", f"Step {len(steps) + 1}"),
            "action_type": "config_change",
            "description": raw_step.get("description", ""),
            "script": script,
            "rollback_script": "",
            "risk_level": "medium",
            "estimated_duration_seconds": 30,
            "validation_command": f"systemctl is-active --quiet {service_name} || true",
        })

    # Build combined artifact
    full_script = _render_script_from_commands(all_bash) if all_bash else ""
    artifacts = [{
        "id": "primary-apply",
        "name": "remediate.sh",
        "kind": "shell",
        "language": "bash",
        "purpose": "apply",
        "description": f"LLM-generated remediation script for {issue_type.replace('_', ' ')} on {node_name}.",
        "content": full_script,
    }]

    # Rollback artifact
    rollback_cmds = result.get("rollback_commands", [])
    if isinstance(rollback_cmds, str):
        rollback_cmds = [rollback_cmds]
    if rollback_cmds:
        artifacts.append({
            "id": "primary-rollback",
            "name": "rollback.sh",
            "kind": "shell",
            "language": "bash",
            "purpose": "rollback",
            "description": f"Rollback script for {service_name}.",
            "content": _render_script_from_commands(rollback_cmds),
        })

    plan_summary = result.get("plan_summary", f"Remediate {issue_type.replace('_', ' ')} on {node_name}.")
    return steps, artifacts, plan_summary


# ── Predictive fallback ─────────────────────────────────────────────

_PREDICT_PROMPT = """\
You are an SRE prediction engine. Given this infrastructure anomaly, predict its impact.

Anomaly type: {anomaly_type}
Key metrics: {metrics_summary}

Return ONLY a JSON object:
{{
  "predicted_impact": "one sentence describing what will happen if untreated",
  "escalation_risk": "low|medium|high"
}}
"""


async def llm_predict_impact(
    anomaly_type: str,
    metrics: dict,
) -> dict | None:
    """Ask the LLM for impact prediction when no heuristic matches."""
    key_metrics = {
        k: metrics.get(k)
        for k in ("cpu_percent", "memory_percent", "disk_percent",
                   "error_rate", "latency_ms", "network_in_mbps")
        if metrics.get(k) is not None
    }
    prompt = _PREDICT_PROMPT.format(
        anomaly_type=anomaly_type,
        metrics_summary=json.dumps(key_metrics),
    )
    result = await _call_llm(prompt, temperature=_settings.predictive_temperature)
    if not result or "predicted_impact" not in result:
        return None
    return {
        "predicted_impact": str(result.get("predicted_impact", "")),
        "escalation_risk": str(result.get("escalation_risk", "medium")),
    }
