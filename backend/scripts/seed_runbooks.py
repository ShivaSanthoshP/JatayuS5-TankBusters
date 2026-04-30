"""Seed canonical runbooks into the database and vector store.

Run once against a fresh DB (or any time you want to re-sync the canonical set):

    cd backend
    python -m scripts.seed_runbooks

This is idempotent — each runbook is upserted by `issue_type`, so re-running
will refresh the canonical rows without disturbing incident-derived runbooks.

The seeded runbooks carry the same structured data the agents previously had
hard-coded (root cause, causal chain, blast radius, recommended actions,
remediation steps, shell artifacts). Templates use `{service_name}`,
`{node_name}`, `{prefix}`, `{issue_type}` placeholders that the runtime
agents render at lookup time with concrete incident values.
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

# Allow running as `python scripts/seed_runbooks.py` from the backend dir.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.database.models import RunbookEntry  # noqa: E402
from app.database.session import SessionLocal, init_db  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("seed_runbooks")


# ── Canonical issue profiles ────────────────────────────────────────
# Carry both the diagnostic profile and the remediation template for each
# issue type. Placeholder tokens in the script bodies are rendered at lookup
# time by the agents.

ISSUE_PROFILES: dict[str, dict] = {
    "memory_leak": {
        "title": "Memory Leak Recovery",
        "root_cause": "application memory consumption is growing until the node is under OOM pressure",
        "causal_chain": [
            "application allocates memory faster than it releases it",
            "memory pressure increases and GC / reclaim overhead grows",
            "latency increases and the service risks OOM termination",
        ],
        "blast_radius": ["the affected node", "services routed to this node"],
        "blast_radius_severity": "medium",
        "recommended_actions": [
            {"action": "Restart the affected service", "type": "restart_service", "priority": 1, "description": "recover memory headroom quickly"},
            {"action": "Inspect heap / process growth and reduce memory pressure", "type": "config_change", "priority": 2, "description": "identify the leaking component or workload"},
            {"action": "Add headroom or scale replicas if usage returns quickly", "type": "scale_up", "priority": 3, "description": "stabilize the service while the leak is investigated"},
        ],
        "template": "restart_service",
    },
    "cpu_spike": {
        "title": "CPU Spike Recovery",
        "root_cause": "a runaway workload or exhausted worker pool is saturating CPU on the node",
        "causal_chain": [
            "CPU saturation slows request processing",
            "queues build up and timeouts begin to appear",
            "error rate and latency rise for the service",
        ],
        "blast_radius": ["the affected node", "requests handled by this service"],
        "blast_radius_severity": "medium",
        "recommended_actions": [
            {"action": "Restart the impacted service or worker process", "type": "restart_service", "priority": 1, "description": "clear the runaway process quickly"},
            {"action": "Limit expensive workload or scale out processing", "type": "rate_limit", "priority": 2, "description": "reduce pressure while the root trigger is reviewed"},
            {"action": "Capture process/thread diagnostics", "type": "config_change", "priority": 3, "description": "identify hot paths or background jobs causing CPU burn"},
        ],
        "template": "restart_service",
    },
    "disk_full": {
        "title": "Disk Full Recovery",
        "root_cause": "local disk capacity is exhausted, usually by logs, temp files, or write-ahead data growth",
        "causal_chain": [
            "disk utilization reaches a critical threshold",
            "writes begin to fail and log rotation / WAL growth cannot proceed",
            "service health degrades because it cannot persist required data",
        ],
        "blast_radius": ["the affected node", "write paths that depend on local storage"],
        "blast_radius_severity": "high",
        "recommended_actions": [
            {"action": "Free disk space by rotating or removing non-critical files", "type": "clear_disk", "priority": 1, "description": "recover write capacity immediately"},
            {"action": "Restart the impacted service after space is recovered", "type": "restart_service", "priority": 2, "description": "bring failed writers back cleanly"},
            {"action": "Increase disk headroom or retention policy", "type": "scale_up", "priority": 3, "description": "prevent rapid recurrence"},
        ],
        "template": "disk_cleanup",
    },
    "network_saturation": {
        "title": "Network Saturation Recovery",
        "root_cause": "network throughput or connection tracking capacity is exhausted on the node or edge",
        "causal_chain": [
            "network buffers and connection tables fill under abnormal traffic",
            "packet loss and connection resets increase",
            "service-to-service communication becomes unreliable",
        ],
        "blast_radius": ["the affected node", "upstream and downstream dependencies"],
        "blast_radius_severity": "high",
        "recommended_actions": [
            {"action": "Rate-limit or block abusive traffic", "type": "rate_limit", "priority": 1, "description": "reduce immediate saturation"},
            {"action": "Restart edge service if connection state is wedged", "type": "restart_service", "priority": 2, "description": "clear overloaded workers or listeners"},
            {"action": "Tune or scale network handling capacity", "type": "config_change", "priority": 3, "description": "avoid repeated conntrack or buffer exhaustion"},
        ],
        "template": "restart_service",
    },
    "connection_pool_exhaustion": {
        "title": "Connection Pool Exhaustion Recovery",
        "root_cause": "the application cannot obtain database connections because the pool is exhausted or the backend is saturated",
        "causal_chain": [
            "connection demand exceeds pool capacity",
            "requests wait for idle connections and latency increases",
            "timeouts and request failures occur across database-backed operations",
        ],
        "blast_radius": ["the affected application", "database-backed request paths"],
        "blast_radius_severity": "high",
        "recommended_actions": [
            {"action": "Restart the application or pool manager", "type": "restart_service", "priority": 1, "description": "clear stuck or leaked connections"},
            {"action": "Reduce inflight traffic temporarily", "type": "rate_limit", "priority": 2, "description": "allow the pool to recover"},
            {"action": "Resize the pool or database connection budget", "type": "config_change", "priority": 3, "description": "match capacity to observed load"},
        ],
        "template": "restart_service",
    },
    "cascading_failure": {
        "title": "Cascading Failure Recovery",
        "root_cause": "an upstream dependency is failing and retries are propagating instability to dependent services",
        "causal_chain": [
            "an upstream dependency begins returning failures",
            "retries and circuit-breaker activity increase pressure downstream",
            "multiple services begin failing in sequence",
        ],
        "blast_radius": ["the affected service", "dependent services", "customer-facing traffic"],
        "blast_radius_severity": "high",
        "recommended_actions": [
            {"action": "Fail over or isolate the unhealthy dependency", "type": "failover", "priority": 1, "description": "stop the error propagation path"},
            {"action": "Rate-limit retries and restart impacted services", "type": "rate_limit", "priority": 2, "description": "reduce retry amplification"},
            {"action": "Roll back the triggering change if recent", "type": "rollback", "priority": 3, "description": "restore the last known healthy state"},
        ],
        "template": "restart_service",
    },
    "latency_degradation": {
        "title": "Latency Degradation Recovery",
        "root_cause": "resource contention or dependency slowdown is causing sustained response-time degradation",
        "causal_chain": [
            "service latency rises under pressure",
            "request queues and retries increase",
            "user-facing SLAs begin to degrade",
        ],
        "blast_radius": ["the affected service", "user-facing request latency"],
        "blast_radius_severity": "medium",
        "recommended_actions": [
            {"action": "Restart the slow service if resources are wedged", "type": "restart_service", "priority": 1, "description": "recover quickly if the node is unhealthy"},
            {"action": "Reduce traffic or expensive operations temporarily", "type": "rate_limit", "priority": 2, "description": "keep latency within a safer range"},
            {"action": "Tune backend dependency or scale capacity", "type": "config_change", "priority": 3, "description": "address the sustained bottleneck"},
        ],
        "template": "restart_service",
    },
    "error_spike": {
        "title": "Error Spike Recovery",
        "root_cause": "application failures are rising because a dependency or local component is unstable",
        "causal_chain": [
            "request failures begin increasing",
            "clients retry or abandon requests",
            "service health and customer experience degrade",
        ],
        "blast_radius": ["the affected service", "requests served by the service"],
        "blast_radius_severity": "medium",
        "recommended_actions": [
            {"action": "Restart the failing service", "type": "restart_service", "priority": 1, "description": "recover from transient broken state"},
            {"action": "Inspect recent errors and dependency health", "type": "config_change", "priority": 2, "description": "pinpoint the failing path"},
            {"action": "Roll back recent risky changes if needed", "type": "rollback", "priority": 3, "description": "return to a known stable revision"},
        ],
        "template": "restart_service",
    },
}


# ── Remediation templates ───────────────────────────────────────────
# These produce (steps, artifacts, summary). Placeholder tokens are kept
# unrendered — the remediation agent renders them with concrete incident
# values (`service_name`, `node_name`, `prefix`, `issue_type`).

_BASH_HEADER = "#!/usr/bin/env bash\nset -euo pipefail\n\n"


def _render(lines: list[str]) -> str:
    return _BASH_HEADER + "\n".join(lines).strip() + "\n"


def _step(order, action, action_type, description, script, validation_command,
          duration, risk_level="low", rollback_script=""):
    return {
        "order": order,
        "action": action,
        "action_type": action_type,
        "description": description,
        "script": script,
        "rollback_script": rollback_script,
        "risk_level": risk_level,
        "estimated_duration_seconds": duration,
        "validation_command": validation_command,
    }


def _artifact(artifact_id, name, purpose, description, content):
    return {
        "id": artifact_id,
        "name": name,
        "kind": "shell",
        "language": "bash",
        "purpose": purpose,
        "description": description,
        "content": content,
    }


def _restart_service_template() -> dict:
    inspect_script = _render([
        "echo 'Inspecting {prefix} symptoms on {node_name}'",
        "date",
        "uptime",
        "ps -eo pid,ppid,cmd,%mem,%cpu --sort=-%mem | head -n 15",
        "ss -s || true",
    ])
    restart_script = _render([
        "echo 'Restarting {service_name} to recover from {prefix}'",
        "sudo systemctl restart '{service_name}'",
        "sleep 5",
        "sudo systemctl is-active --quiet '{service_name}'",
        "journalctl -u '{service_name}' -n 20 --no-pager || true",
    ])
    validate_script = _render([
        "echo 'Validating {service_name} health and current resource pressure'",
        "sudo systemctl is-active --quiet '{service_name}'",
        "free -m || true",
        "df -h / || true",
        "journalctl -p warning -n 20 --no-pager || true",
    ])
    rollback_script = _render([
        "echo 'Rollback for {service_name}: restart service again to restore a clean state'",
        "sudo systemctl restart '{service_name}'",
    ])

    steps = [
        _step(1, "Capture current node state", "config_change",
              "Collect quick process, socket, and uptime evidence before changing the service.",
              inspect_script,
              "uptime && ps -eo pid,cmd,%mem,%cpu --sort=-%mem | head", 30),
        _step(2, "Restart {service_name}", "restart_service",
              "Recycle the local service to clear stuck workers, leaked memory, or exhausted connections.",
              restart_script,
              "systemctl is-active --quiet {service_name}", 45,
              rollback_script=rollback_script),
        _step(3, "Validate recovery", "config_change",
              "Confirm the service is healthy and key pressure indicators have eased.",
              validate_script,
              "systemctl is-active --quiet {service_name} && journalctl -u {service_name} -n 20 --no-pager", 30),
    ]

    primary_apply = _render([
        'SERVICE="${{SERVICE_NAME:-{service_name}}}"',
        "echo 'Capturing node state before remediating {prefix}'",
        "date",
        "uptime",
        "ps -eo pid,ppid,cmd,%mem,%cpu --sort=-%mem | head -n 15",
        "ss -s || true",
        "",
        'echo "Restarting ${{SERVICE}}"',
        'sudo systemctl restart "${{SERVICE}}"',
        "sleep 5",
        'echo "Validating ${{SERVICE}}"',
        'sudo systemctl is-active --quiet "${{SERVICE}}"',
        "free -m || true",
        "df -h / || true",
        'journalctl -u "${{SERVICE}}" -n 20 --no-pager || true',
    ])
    primary_rollback = _render([
        'SERVICE="${{SERVICE_NAME:-{service_name}}}"',
        'echo "Rolling back by restarting ${{SERVICE}} into a clean state"',
        'sudo systemctl restart "${{SERVICE}}"',
        'sudo systemctl is-active --quiet "${{SERVICE}}"',
    ])

    artifacts = [
        _artifact("primary-apply", "remediate.sh", "apply",
                  "Primary remediation script for {issue_type} on {node_name}.",
                  primary_apply),
        _artifact("primary-rollback", "rollback.sh", "rollback",
                  "Simple rollback script for the {service_name} restart procedure.",
                  primary_rollback),
    ]

    summary = ("Capture current state, restart {service_name}, and validate "
               "that service health and node pressure recover.")

    return {"steps": steps, "artifacts": artifacts, "summary": summary}


def _disk_cleanup_template() -> dict:
    cleanup_script = _render([
        "echo 'Checking disk usage before cleanup'",
        "df -h /",
        "sudo journalctl --vacuum-time=7d || true",
        "sudo find /var/log -xdev -type f -name '*.gz' -mtime +7 -delete || true",
        "sudo find /tmp -xdev -type f -mtime +2 -delete || true",
        "echo 'Disk usage after cleanup'",
        "df -h /",
        "sudo systemctl restart '{service_name}'",
        "sudo systemctl is-active --quiet '{service_name}'",
    ])
    validate_script = _render([
        "df -h /",
        "sudo systemctl is-active --quiet '{service_name}'",
        "journalctl -u '{service_name}' -n 20 --no-pager || true",
    ])
    inspect_script = _render([
        "df -h /",
        "sudo du -sh /var/log /tmp 2>/dev/null || true",
    ])

    steps = [
        _step(1, "Check filesystem pressure", "clear_disk",
              "Verify that root volume usage is critically high before cleanup.",
              inspect_script, "df -h /", 20, risk_level="medium"),
        _step(2, "Free safe local disk space", "clear_disk",
              "Vacuum old journal files and remove stale compressed logs and temp files.",
              cleanup_script, "df -h /", 60, risk_level="medium"),
        _step(3, "Restart {service_name} and validate", "restart_service",
              "Bring the service back cleanly after write capacity is restored.",
              validate_script,
              "systemctl is-active --quiet {service_name} && df -h /",
              30, risk_level="medium"),
    ]
    artifacts = [
        _artifact("primary-apply", "remediate.sh", "apply",
                  "Disk recovery script for {node_name}.", cleanup_script),
    ]
    summary = ("Recover disk headroom by cleaning safe stale files, then "
               "restart and validate the affected service.")

    return {"steps": steps, "artifacts": artifacts, "summary": summary}


TEMPLATES: dict[str, dict] = {
    "restart_service": _restart_service_template(),
    "disk_cleanup": _disk_cleanup_template(),
}


# ── Seed driver ─────────────────────────────────────────────────────

def _build_solution_text(profile: dict, template: dict) -> str:
    """Human-readable solution_steps blob used by RAG search."""
    actions = "\n".join(
        f"  {a['priority']}. {a['action']} — {a['description']}"
        for a in profile["recommended_actions"]
    )
    step_lines = "\n".join(
        f"  {s['order']}. {s['action']}: {s['description']}"
        for s in template["steps"]
    )
    return (
        f"Root cause: {profile['root_cause']}\n"
        f"Causal chain:\n  - " + "\n  - ".join(profile["causal_chain"]) + "\n"
        f"Recommended actions:\n{actions}\n"
        f"Remediation steps:\n{step_lines}\n"
        f"Plan summary: {template['summary']}"
    )


def seed() -> dict:
    init_db()

    counts = {"created": 0, "updated": 0}
    db = SessionLocal()
    try:
        for issue_type, profile in ISSUE_PROFILES.items():
            template = TEMPLATES[profile["template"]]
            solution_text = _build_solution_text(profile, template)

            existing = (
                db.query(RunbookEntry)
                .filter(RunbookEntry.issue_type == issue_type)
                .one_or_none()
            )

            payload = {
                "title": profile["title"],
                "problem_pattern": profile["root_cause"],
                "solution_steps": solution_text,
                "issue_type": issue_type,
                "root_cause": profile["root_cause"],
                "causal_chain": profile["causal_chain"],
                "blast_radius": profile["blast_radius"],
                "blast_radius_severity": profile["blast_radius_severity"],
                "recommended_actions": profile["recommended_actions"],
                "remediation_summary": template["summary"],
                "remediation_steps": template["steps"],
                "artifacts": template["artifacts"],
                "is_seeded": True,
            }

            if existing:
                for k, v in payload.items():
                    setattr(existing, k, v)
                runbook = existing
                counts["updated"] += 1
            else:
                runbook = RunbookEntry(**payload)
                db.add(runbook)
                counts["created"] += 1

            db.flush()

            # Mirror into the vector store for RAG retrieval.
            try:
                from app.memory.vector_store import get_memory
                memory = get_memory()
                memory.store_runbook(
                    runbook_id=runbook.id,
                    title=runbook.title,
                    problem_pattern=runbook.problem_pattern,
                    solution_steps=runbook.solution_steps,
                )
            except Exception as e:
                logger.warning(f"Vector store push failed for {issue_type}: {e}")

        db.commit()
    finally:
        db.close()

    logger.info(f"Seeded runbooks: {counts}")
    return counts


if __name__ == "__main__":
    seed()
