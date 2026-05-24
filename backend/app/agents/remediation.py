from __future__ import annotations
"""
Remediation Agent — generates and manages remediation actions.

Loads canonical templates from the runbook table (authored from the UI /
Argus — see the Runbooks page). Each issue_type's runbook carries the
remediation steps and shell artifacts as Python format-string templates;
this agent renders them with concrete incident values at lookup time.
Falls back to the configured LLM for novel issue types.
"""

import asyncio
import copy
import logging
import re
import string

from app.database.models import RunbookEntry
from app.database.session import SessionLocal
from app.remediation.artifacts import normalize_remediation_payload

logger = logging.getLogger("itops.remediation")


# Service inference: map node names / types to canonical service names so
# the rendered remediation scripts target the right systemd unit. This is
# parsing logic (not runbook content), so it stays in code.
SERVICE_HINTS = [
    ("nginx", ("nginx", "load_balancer", "lb")),
    ("postgresql", ("postgres", "pg-", "database", "db")),
    ("mysql", ("mysql",)),
    ("redis", ("redis", "cache")),
    ("kafka", ("kafka", "queue")),
    ("worker", ("worker",)),
    ("api-server", ("api",)),
    ("app-server", ("app", "web")),
]


def _normalize_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def _service_from_logs(log_history: str) -> str | None:
    patterns = [
        re.compile(r"\bservice ['\"]?([a-zA-Z0-9._-]+)['\"]?", re.IGNORECASE),
        re.compile(r"\bfor service ([a-zA-Z0-9._-]+)\b", re.IGNORECASE),
        re.compile(r"\b([a-zA-Z0-9._-]+)\.service\b", re.IGNORECASE),
    ]
    for line in (log_history or "").splitlines():
        for pattern in patterns:
            match = pattern.search(line)
            if match:
                # Strip any chars that could escape Python format() templates,
                # and cap length to avoid oversized command strings.
                raw = match.group(1)
                sanitized = re.sub(r"[{}\[\]%]", "", raw)[:64]
                return sanitized or None
    return None


def _infer_service_name(metrics: dict, log_history: str) -> str:
    from_logs = _service_from_logs(log_history)
    if from_logs:
        return from_logs

    node_name = _normalize_text(metrics.get("node_name"))
    node_type = _normalize_text(metrics.get("node_type"))
    haystack = f"{node_name} {node_type}".lower()
    for service, hints in SERVICE_HINTS:
        if any(hint in haystack for hint in hints):
            return service
    return "app-server"


def _derive_issue_type(diagnostic_data: dict) -> str:
    explicit = diagnostic_data.get("issue_type")
    if explicit:
        return str(explicit)

    root_cause = _normalize_text(diagnostic_data.get("root_cause")).lower()
    if "memory" in root_cause or "oom" in root_cause:
        return "memory_leak"
    if "disk" in root_cause or "storage" in root_cause:
        return "disk_full"
    if "connection" in root_cause and "pool" in root_cause:
        return "connection_pool_exhaustion"
    if "network" in root_cause:
        return "network_saturation"
    if "latency" in root_cause:
        return "latency_degradation"
    if "cpu" in root_cause:
        return "cpu_spike"
    if "cascade" in root_cause or "upstream" in root_cause:
        return "cascading_failure"
    return "error_spike"


# ── Template rendering ──────────────────────────────────────────────

class _PartialFormatter(string.Formatter):
    """str.format() variant that leaves unknown placeholders as-is.

    `"a {x} b {y}".format(x=1)` raises KeyError and loses the rendered `{x}`
    too. This formatter substitutes what it can and writes literal `{key}`
    back for anything missing, so a typo or new placeholder in a runbook
    template doesn't poison sibling substitutions.
    """

    def get_field(self, field_name, args, kwargs):
        try:
            return super().get_field(field_name, args, kwargs)
        except (KeyError, IndexError, AttributeError):
            return ("{" + field_name + "}", field_name)

    def format_field(self, value, format_spec):
        try:
            return super().format_field(value, format_spec)
        except (TypeError, ValueError):
            return str(value)


_FORMATTER = _PartialFormatter()


def _render_value(value, context: dict):
    """Recursively render every string in a nested template structure."""
    if isinstance(value, str):
        try:
            return _FORMATTER.vformat(value, (), context)
        except Exception as e:
            logger.debug(f"Template render fallback for value={value!r}: {e}")
            return value
    if isinstance(value, dict):
        return {k: _render_value(v, context) for k, v in value.items()}
    if isinstance(value, list):
        return [_render_value(v, context) for v in value]
    return value


def _render_template(steps: list[dict], artifacts: list[dict],
                     summary: str, context: dict) -> tuple[list[dict], list[dict], str]:
    return (
        _render_value(copy.deepcopy(steps), context),
        _render_value(copy.deepcopy(artifacts), context),
        _render_value(summary, context),
    )


def _load_template(issue_type: str) -> dict | None:
    """Fetch the seeded runbook for an issue_type."""
    db = SessionLocal()
    try:
        entry = (
            db.query(RunbookEntry)
            .filter(RunbookEntry.issue_type == issue_type)
            .one_or_none()
        )
        if not entry or not entry.remediation_steps:
            return None
        return {
            "steps": entry.remediation_steps,
            "artifacts": entry.artifacts or [],
            "summary": entry.remediation_summary or "",
        }
    finally:
        db.close()


# ── RAG context ─────────────────────────────────────────────────────

async def _similar_remediation_context(issue_type: str, root_cause: str) -> tuple[str, bool]:
    """Search past incidents and runbooks for similar remediation context."""
    try:
        from app.memory.vector_store import get_memory
        memory = get_memory()
        query = f"{issue_type} {root_cause}"
        similar, runbooks = await asyncio.gather(
            asyncio.to_thread(memory.search_similar_incidents, query, 3),
            asyncio.to_thread(memory.search_runbooks, query, 2),
        )

        chunks: list[str] = []
        if similar:
            chunks.append("Similar past incidents:")
            for entry in similar:
                chunks.append(f"- {entry['document'][:300]}")
        if runbooks:
            chunks.append("Relevant runbooks:")
            for entry in runbooks:
                chunks.append(f"- {entry['document'][:300]}")

        if not chunks:
            return "No similar past incidents found.", False
        return "\n".join(chunks), True
    except Exception as e:
        logger.warning(f"RAG search failed in remediation: {e}")
        return "No similar past incidents found.", False


# ── Provider-aware command helpers ──────────────────────────────────

def _provider_restart_cmd(service_name: str, provider: str) -> str:
    if provider == "aws":
        return f"aws ec2 reboot-instances --instance-ids $INSTANCE_ID  # or: systemctl restart {service_name}"
    if provider == "azure":
        return f"az vm restart --name $VM_NAME --resource-group $RESOURCE_GROUP  # or: systemctl restart {service_name}"
    if provider == "gcp":
        return f"gcloud compute instances reset $INSTANCE_NAME --zone=$ZONE  # or: systemctl restart {service_name}"
    return f"systemctl restart {service_name}"


def _provider_logs_cmd(service_name: str, provider: str) -> str:
    if provider == "aws":
        return f"aws logs filter-log-events --log-group-name /aws/ec2/{service_name}"
    if provider == "azure":
        return "az monitor activity-log list --resource-group $RESOURCE_GROUP"
    if provider == "gcp":
        return "gcloud logging read 'resource.type=gce_instance' --limit=50"
    return f"journalctl -u {service_name} -n 100"


# ── Deterministic last-resort plan ──────────────────────────────────
# Per-issue diagnostic probes used only when there is NO seeded runbook
# AND the LLM fallback is unavailable. They keep a downloadable
# remediate.sh / rollback.sh present for every incident so the operator
# is never left with an empty plan. {logs_cmd} is rendered per provider.
_GENERIC_ISSUE_PROBES: dict[str, list[str]] = {
    "memory_leak":                 ["free -h", "ps aux --sort=-%mem | head -n 10"],
    "cpu_spike":                   ["uptime", "ps aux --sort=-%cpu | head -n 10"],
    "disk_full":                   ["df -h", "du -xhd1 / 2>/dev/null | sort -rh | head -n 10"],
    "network_saturation":          ["ss -s", "ss -tunp 2>/dev/null | head -n 20"],
    "connection_pool_exhaustion":  ["ss -tan state established | wc -l", "{logs_cmd}"],
    "latency_degradation":         ["uptime", "{logs_cmd}"],
    "error_spike":                 ["{logs_cmd}"],
    "cascading_failure":           ["systemctl --failed --no-pager 2>/dev/null || true", "{logs_cmd}"],
}

_SHEBANG = "#!/usr/bin/env bash\nset -euo pipefail\n\n"


def _generic_remediation_plan(
    issue_type: str, service_name: str, context: dict,
) -> tuple[list[dict], str]:
    """Build a sensible, provider-aware shell plan with no runbook and no LLM.

    Returns (steps, summary). The step `script` / `rollback_script` fields are
    aggregated into remediate.sh + rollback.sh by normalize_remediation_payload,
    so the operator always gets downloadable artifacts to review.
    """
    pretty = issue_type.replace("_", " ")
    probe_templates = _GENERIC_ISSUE_PROBES.get(issue_type, ["{logs_cmd}"])
    probe_block = "\n".join(
        _FORMATTER.vformat(p, (), context) for p in probe_templates
    )
    restart = context["restart_cmd"]

    steps = [
        {
            "order": 1,
            "action": f"Capture {pretty} diagnostics on {service_name}",
            "action_type": "diagnostic",
            "description": (
                f"Snapshot the current state before any change so the {pretty} "
                f"can be confirmed and compared after remediation."
            ),
            "script": (
                f"{_SHEBANG}echo '== {pretty} diagnostics for {service_name} =='\n"
                f"{probe_block}\n"
                f"journalctl -u {service_name} -n 50 --no-pager 2>/dev/null || true\n"
            ),
            "rollback_script": "",
            "risk_level": "low",
            "estimated_duration_seconds": 15,
            "validation_command": "echo 'diagnostics captured'",
        },
        {
            "order": 2,
            "action": f"Restart {service_name} to clear the {pretty}",
            "action_type": "restart_service",
            "description": (
                "Restarting the service releases leaked or exhausted resources and "
                "restores availability while a permanent fix is investigated."
            ),
            "script": f"{_SHEBANG}{restart}\n",
            "rollback_script": (
                f"{_SHEBANG}# A restart has no destructive change to undo; "
                f"re-check service health instead.\n"
                f"systemctl status {service_name} --no-pager 2>/dev/null || true\n"
            ),
            "risk_level": "medium",
            "estimated_duration_seconds": 30,
            "validation_command": f"systemctl is-active --quiet {service_name}",
        },
        {
            "order": 3,
            "action": f"Validate {service_name} recovery",
            "action_type": "validation",
            "description": f"Confirm the service is healthy and the {pretty} indicators have cleared.",
            "script": (
                f"{_SHEBANG}sleep 5\n"
                f"systemctl is-active --quiet {service_name} && echo '{service_name} is active'\n"
                f"{probe_block}\n"
            ),
            "rollback_script": "",
            "risk_level": "low",
            "estimated_duration_seconds": 15,
            "validation_command": f"systemctl is-active --quiet {service_name}",
        },
    ]

    summary = (
        f"Deterministic {pretty} remediation for {service_name}: capture diagnostics, "
        f"restart the service to clear the condition, then validate recovery. "
        f"Generated without a seeded runbook or LLM — review before applying."
    )
    return steps, summary


# ── Plan builder ────────────────────────────────────────────────────

async def _build_plan(
    issue_type: str, service_name: str, metrics: dict,
    log_history: str, root_cause: str = "", provider: str = "simulated",
) -> tuple[list[dict], list[dict], str, bool, str]:
    """Return (steps, artifacts, summary, generated_locally, past_context).

    Loads templates from seeded runbooks and renders them with concrete
    incident values. Falls back to the configured LLM for issue types
    that have no seeded runbook.
    """
    past_context, used_rag = await _similar_remediation_context(issue_type, root_cause)

    context = {
        "service_name": service_name,
        "node_name": metrics.get("node_name", "unknown-node"),
        "issue_type": issue_type,
        "prefix": issue_type.replace("_", " "),
        "provider": provider,
        "restart_cmd": _provider_restart_cmd(service_name, provider),
        "logs_cmd": _provider_logs_cmd(service_name, provider),
    }

    template = await asyncio.to_thread(_load_template, issue_type)
    if template:
        steps, artifacts, summary = _render_template(
            template["steps"], template["artifacts"], template["summary"], context,
        )
        return steps, artifacts, summary, True, past_context

    # ── LLM fallback for unknown issue types ─────────────────────
    try:
        from app.agents.llm_fallback import llm_remediate
        llm_result = await llm_remediate(
            issue_type=issue_type,
            service_name=service_name,
            node_name=context["node_name"],
            root_cause=root_cause,
            metrics=metrics,
            past_context=past_context,
            provider=provider,
        )
        if llm_result:
            steps, artifacts, summary = llm_result
            return steps, artifacts, summary, False, past_context
    except Exception as e:
        logger.warning(f"LLM remediation fallback failed: {e}")

    # Next fallback: try the generic error_spike template if it's seeded.
    fallback = await asyncio.to_thread(_load_template, "error_spike")
    if fallback:
        steps, artifacts, summary = _render_template(
            fallback["steps"], fallback["artifacts"], fallback["summary"], context,
        )
        return steps, artifacts, summary, True, past_context

    # Last resort — no seeded runbook AND no LLM. Build a deterministic
    # provider-aware shell plan so the operator always gets a reviewable,
    # downloadable remediate.sh / rollback.sh instead of an empty plan.
    steps, summary = _generic_remediation_plan(issue_type, service_name, context)
    return steps, [], summary, False, past_context


async def generate_remediation(diagnostic_data: dict, metrics: dict, log_history: str = "No logs available") -> dict:
    """Generate a remediation plan — DB-backed runbook first, LLM fallback for unknowns."""
    issue_type = _derive_issue_type(diagnostic_data)
    service_name = _infer_service_name(metrics, log_history)
    root_cause = diagnostic_data.get("root_cause", "")
    provider = metrics.get("provider", "simulated")
    steps, artifacts, plan_summary, generated_locally, past_context = await _build_plan(
        issue_type, service_name, metrics, log_history, root_cause, provider=provider,
    )
    used_rag = past_context != "No similar past incidents found."

    reasoning = (
        f"Generated a runbook-backed {issue_type.replace('_', ' ')} remediation plan for service "
        f"{service_name} using the node role, root cause, and current log evidence."
    )
    if not generated_locally:
        reasoning = (
            f"Generated an LLM-assisted {issue_type.replace('_', ' ')} remediation plan for "
            f"service {service_name} because no seeded runbook matched the issue type."
        )

    result = {
        "plan_summary": plan_summary,
        "strategy": "shell",
        "artifacts": artifacts,
        "steps": steps,
        "total_estimated_duration_seconds": sum(step.get("estimated_duration_seconds", 0) for step in steps),
        "requires_downtime": False,
        "canary_compatible": False,
        "reasoning": reasoning,
        "issue_type": issue_type,
        "service_name": service_name,
        "agent": "remediation",
        "generated_locally": generated_locally,
        "rag_context_used": used_rag,
        "similar_past_remediations": past_context[:500] if used_rag else None,
    }

    return normalize_remediation_payload(result)
