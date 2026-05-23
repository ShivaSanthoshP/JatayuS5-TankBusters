from __future__ import annotations

"""Agent management & pipeline trigger API routes."""

import asyncio
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db, SessionLocal
from app.api.schemas import (
    PipelineRunRequest, PipelineResult, AgentInfo, RunbookEntryOut, RunbookWrite,
)
from app.agents.orchestrator import run_pipeline
from app.services.infra_service import InfraService
from app.services.incident_service import IncidentService
from app.data_sources.simulator import SimulatorDataSource
from app.data_sources.base import MetricEvent
from app.database.models import RunbookEntry, LogEntry
from app.config import utc_now

logger = logging.getLogger("itops.api.agents")

router = APIRouter(prefix="/agents", tags=["Agents"])

# Insertion-ordered. Evicts the oldest entry once we exceed MAX_PIPELINE_RUNS
# so a client spamming /pipeline/start can't exhaust memory with retained
# progress-event histories.
_pipeline_runs: dict[str, dict] = {}
MAX_PIPELINE_RUNS = 100


def _register_pipeline_run(run_id: str, record: dict) -> None:
    _pipeline_runs[run_id] = record
    while len(_pipeline_runs) > MAX_PIPELINE_RUNS:
        # Python dicts preserve insertion order; pop the oldest.
        oldest = next(iter(_pipeline_runs))
        _pipeline_runs.pop(oldest, None)


def _persist_pipeline_incident(metrics: dict, state: dict) -> int | None:
    """Persist a pipeline result as an incident. Runs on a worker thread."""
    db = SessionLocal()
    try:
        infra_svc = InfraService(db)
        incident_svc = IncidentService(db)
        node = infra_svc.get_node_by_name(metrics.get("node_name", ""))
        if not node:
            event = MetricEvent(
                node_name=metrics.get("node_name", "custom-node"),
                node_type=metrics.get("node_type", "server"),
                provider=metrics.get("provider", "manual"),
                region=metrics.get("region", "unknown"),
                ip_address=metrics.get("ip_address", "0.0.0.0"),
                cpu_percent=metrics.get("cpu_percent", 0),
                memory_percent=metrics.get("memory_percent", 0),
                disk_percent=metrics.get("disk_percent", 0),
                network_in_mbps=metrics.get("network_in_mbps", 0),
                network_out_mbps=metrics.get("network_out_mbps", 0),
                request_rate=metrics.get("request_rate", 0),
                error_rate=metrics.get("error_rate", 0),
                latency_ms=metrics.get("latency_ms", 0),
            )
            node = infra_svc.ensure_node_exists(event)
            db.commit()

        incident = incident_svc.create_incident_from_pipeline(node.id, state)
        return incident.id
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

# ── Agent registry (for frontend display) ───────────────────────────

AGENT_REGISTRY = [
    AgentInfo(
        name="monitoring",
        description="Monitors infrastructure metrics and correlates log signals using deterministic thresholds and pattern matching.",
        status="active",
    ),
    AgentInfo(
        name="predictive",
        description="Predicts failure trajectory, estimates time-to-failure, and assesses escalation risk.",
        status="active",
    ),
    AgentInfo(
        name="diagnostic",
        description="Performs root cause analysis using causal reasoning and RAG from institutional memory.",
        status="active",
    ),
    AgentInfo(
        name="remediation",
        description="Generates concise remediation steps and downloadable scripts for operator review.",
        status="active",
    ),
    AgentInfo(
        name="reporting",
        description="Generates incident reports, timelines, and auto-creates runbook entries.",
        status="active",
    ),
]


@router.get("/", response_model=list[AgentInfo])
def list_agents():
    """List all available agents and their status."""
    return AGENT_REGISTRY


def _build_pipeline_result(state: dict, incident_id: int | None = None) -> dict:
    return PipelineResult(
        incident_id=incident_id,
        status=state.get("status", "unknown"),
        is_anomaly=state.get("is_anomaly", False),
        severity=state.get("severity"),
        monitoring_result=state.get("monitoring_result", {}),
        prediction_result=state.get("prediction_result", {}),
        diagnostic_result=state.get("diagnostic_result", {}),
        remediation_result=state.get("remediation_result", {}),
        reporting_result=state.get("reporting_result", {}),
        agent_trace=state.get("agent_trace", []),
        started_at=state.get("started_at"),
        completed_at=state.get("completed_at"),
    ).model_dump()


def _resolve_pipeline_context(body: PipelineRunRequest, db: Session) -> tuple[dict, str, str]:
    infra_svc = InfraService(db)

    if body.custom_metrics:
        metrics = body.custom_metrics
    elif body.node_name:
        node = infra_svc.get_node_by_name(body.node_name)
        if not node:
            raise HTTPException(404, f"Node '{body.node_name}' not found in infrastructure")
        latest = infra_svc.get_latest_metric_snapshot(node.id)
        if not latest:
            raise HTTPException(404, f"No metrics recorded yet for '{body.node_name}'")
        metrics = {
            "node_name": node.node_name,
            "node_type": node.node_type,
            "provider": node.provider,
            "region": node.region,
            "cpu_percent": latest.cpu_percent,
            "memory_percent": latest.memory_percent,
            "disk_percent": latest.disk_percent,
            "network_in_mbps": latest.network_in_mbps,
            "network_out_mbps": latest.network_out_mbps,
            "request_rate": latest.request_rate,
            "error_rate": latest.error_rate,
            "latency_ms": latest.latency_ms,
        }
    else:
        raise HTTPException(400, "Provide node_name or custom_metrics")

    metric_history = ""
    log_history = ""
    node = infra_svc.get_node_by_name(metrics.get("node_name", ""))
    if node:
        metric_history = infra_svc.get_recent_metrics_as_history(node.id)
        log_history = infra_svc.get_recent_logs_as_history(node.id)

    return metrics, metric_history, log_history


def _append_progress_event(run_id: str, event: dict) -> None:
    run = _pipeline_runs.get(run_id)
    if not run:
        return

    run["progress_events"].append(event)
    phase = event.get("phase")
    agent = event.get("agent")
    if phase == "started":
        run["current_agent"] = agent
        run["current_phase"] = phase
    elif phase == "completed" and run.get("current_agent") == agent:
        run["current_phase"] = phase
    elif phase == "error":
        run["current_agent"] = agent
        run["current_phase"] = phase
        run["error"] = event.get("error") or event.get("message")


async def _run_pipeline_job(run_id: str, metrics: dict, metric_history: str, log_history: str):
    run = _pipeline_runs[run_id]
    run["status"] = "running"

    async def _progress_callback(event: dict):
        _append_progress_event(run_id, event)

    state = await run_pipeline(
        metrics,
        metric_history,
        log_history,
        progress_callback=_progress_callback,
    )

    incident_id = None
    if state.get("is_anomaly"):
        try:
            incident_id = await asyncio.to_thread(_persist_pipeline_incident, metrics, state)
        except Exception as e:
            logger.error(f"Async pipeline persistence failed for run {run_id}: {e}", exc_info=True)
            run["error"] = str(e)
            run["status"] = "failed"

    run["result"] = _build_pipeline_result(state, incident_id)
    run["completed_at"] = state.get("completed_at") or utc_now().isoformat()
    run["current_agent"] = None
    run["current_phase"] = None
    if run.get("status") != "failed":
        if state.get("error"):
            run["status"] = "failed"
            run["error"] = state.get("error")
        else:
            run["status"] = "completed"


@router.post("/pipeline/start")
async def start_pipeline_run(body: PipelineRunRequest, db: Session = Depends(get_db)):
    """Start a pipeline run in the background and return a run id for polling."""
    metrics, metric_history, log_history = _resolve_pipeline_context(body, db)
    run_id = uuid.uuid4().hex
    _register_pipeline_run(run_id, {
        "run_id": run_id,
        "status": "queued",
        "node_name": metrics.get("node_name", "custom"),
        "current_agent": None,
        "current_phase": None,
        "progress_events": [],
        "result": None,
        "error": None,
        "started_at": utc_now().isoformat(),
        "completed_at": None,
    })
    asyncio.create_task(_run_pipeline_job(run_id, metrics, metric_history, log_history))
    return {"run_id": run_id, "status": "queued"}


@router.get("/pipeline/runs/{run_id}")
def get_pipeline_run(run_id: str):
    run = _pipeline_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Pipeline run not found")
    return run


@router.post("/pipeline/run", response_model=PipelineResult)
async def trigger_pipeline(
    body: PipelineRunRequest,
    db: Session = Depends(get_db),
):
    """
    Manually trigger the full agent pipeline.

    Provide either a node_name (to use current simulated data)
    or custom_metrics dict for testing.
    """
    metrics, metric_history, log_history = _resolve_pipeline_context(body, db)

    # Run the full pipeline
    logger.info(f"Triggering pipeline for: {metrics.get('node_name', 'custom')}")
    state = await run_pipeline(metrics, metric_history, log_history)

    # Persist incident if anomaly was detected
    incident_id = None
    if state.get("is_anomaly"):
        incident_id = await asyncio.to_thread(_persist_pipeline_incident, metrics, state)

    return PipelineResult(**_build_pipeline_result(state, incident_id))


@router.post("/pipeline/run-all")
async def trigger_pipeline_all_nodes(db: Session = Depends(get_db)):
    """
    Run the pipeline for ALL nodes in the simulated fleet.
    Returns a summary of results.
    """
    sim = SimulatorDataSource()
    await sim.connect()
    snapshot = await sim.get_current_snapshot()
    await sim.disconnect()

    infra_svc = InfraService(db)

    results = []
    for event in snapshot:
        metrics = {
            "node_name": event.node_name,
            "node_type": event.node_type,
            "provider": event.provider,
            "region": event.region,
            "cpu_percent": event.cpu_percent,
            "memory_percent": event.memory_percent,
            "disk_percent": event.disk_percent,
            "network_in_mbps": event.network_in_mbps,
            "network_out_mbps": event.network_out_mbps,
            "request_rate": event.request_rate,
            "error_rate": event.error_rate,
            "latency_ms": event.latency_ms,
        }

        # Ensure node exists in DB
        node = infra_svc.ensure_node_exists(event)
        infra_svc.store_metric(node, event)
        db.commit()

        # Get history
        metric_history = infra_svc.get_recent_metrics_as_history(node.id)
        log_history = infra_svc.get_recent_logs_as_history(node.id)

        # Run pipeline
        state = await run_pipeline(metrics, metric_history, log_history)

        incident_id = None
        if state.get("is_anomaly"):
            # Update node status
            severity = state.get("severity", "medium")
            if severity in ("critical",):
                infra_svc.update_node_status(node, "critical")
            elif severity in ("high",):
                infra_svc.update_node_status(node, "degraded")
            db.commit()

            incident_id = await asyncio.to_thread(_persist_pipeline_incident, metrics, state)
        else:
            infra_svc.update_node_status(node, "healthy")
            db.commit()

        results.append({
            "node_name": event.node_name,
            "is_anomaly": state.get("is_anomaly", False),
            "severity": state.get("severity"),
            "incident_id": incident_id,
            "status": state.get("status", "unknown"),
        })

    return {
        "total_nodes": len(results),
        "anomalies_detected": sum(1 for r in results if r["is_anomaly"]),
        "incidents_created": sum(1 for r in results if r["incident_id"] is not None),
        "results": results,
    }


@router.get("/runbooks", response_model=list[RunbookEntryOut])
def list_runbooks(limit: int = 2000, db: Session = Depends(get_db)):
    """List auto-generated runbook entries."""
    entries = (
        db.query(RunbookEntry)
        .order_by(RunbookEntry.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        RunbookEntryOut(
            id=e.id,
            title=e.title,
            problem_pattern=e.problem_pattern,
            solution_steps=e.solution_steps,
            source_incident_id=e.source_incident_id,
            effectiveness_score=e.effectiveness_score,
            times_used=e.times_used,
            issue_type=e.issue_type,
            root_cause=e.root_cause,
            causal_chain=e.causal_chain,
            blast_radius=e.blast_radius,
            blast_radius_severity=e.blast_radius_severity,
            recommended_actions=e.recommended_actions,
            remediation_summary=e.remediation_summary,
            remediation_steps=e.remediation_steps,
            artifacts=e.artifacts,
            is_seeded=bool(e.is_seeded),
            created_at=e.created_at,
        )
        for e in entries
    ]


def _mirror_runbook(rb: RunbookEntry) -> None:
    """Push a runbook into the vector store so RAG surfaces it (best-effort)."""
    try:
        from app.memory.vector_store import get_memory
        get_memory().store_runbook(
            runbook_id=rb.id,
            title=rb.title,
            problem_pattern=rb.problem_pattern,
            solution_steps=rb.solution_steps,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Vector store push for runbook %d failed: %s", rb.id, exc)


def _compose_solution_text(p: RunbookWrite) -> str:
    """Build a readable solution_steps blob from the structured fields, so the
    NOT-NULL column and the RAG document are populated when the admin leaves
    the free-text field blank."""
    parts: list[str] = []
    if p.root_cause:
        parts.append(f"Root cause: {p.root_cause}")
    if p.causal_chain:
        parts.append("Causal chain:\n  - " + "\n  - ".join(p.causal_chain))
    if p.recommended_actions:
        acts = "\n".join(
            f"  {a.priority or i + 1}. {a.action}" + (f" — {a.description}" if a.description else "")
            for i, a in enumerate(p.recommended_actions)
        )
        parts.append("Recommended actions:\n" + acts)
    if p.remediation_steps:
        steps = "\n".join(
            f"  {s.order}. {s.action}" + (f": {s.description}" if s.description else "")
            for s in p.remediation_steps
        )
        parts.append("Remediation steps:\n" + steps)
    if p.remediation_summary:
        parts.append(f"Plan summary: {p.remediation_summary}")
    return "\n".join(parts).strip()


def _normalize_issue_type(raw: str | None) -> str | None:
    return (raw or "").strip() or None


def _apply_runbook_payload(rb: RunbookEntry, p: RunbookWrite) -> None:
    rb.title = p.title.strip()
    rb.problem_pattern = p.problem_pattern.strip()
    rb.issue_type = _normalize_issue_type(p.issue_type)
    rb.root_cause = p.root_cause
    rb.causal_chain = p.causal_chain or None
    rb.blast_radius = p.blast_radius or None
    rb.blast_radius_severity = p.blast_radius_severity
    rb.recommended_actions = [a.model_dump() for a in p.recommended_actions] if p.recommended_actions else None
    rb.remediation_summary = p.remediation_summary
    rb.remediation_steps = [s.model_dump() for s in p.remediation_steps] if p.remediation_steps else None
    rb.artifacts = [a.model_dump() for a in p.artifacts] if p.artifacts else None
    # Keep the NOT-NULL solution_steps populated even when left blank.
    rb.solution_steps = (p.solution_steps or "").strip() or _compose_solution_text(p) or rb.problem_pattern


@router.post("/runbooks", response_model=RunbookEntryOut, status_code=201)
def create_runbook(payload: RunbookWrite, db: Session = Depends(get_db)):
    """Create an admin-authored canonical (seeded) runbook."""
    if not payload.title.strip() or not payload.problem_pattern.strip():
        raise HTTPException(status_code=422, detail="title and problem_pattern are required")
    issue_type = _normalize_issue_type(payload.issue_type)
    if issue_type:
        clash = db.query(RunbookEntry).filter(RunbookEntry.issue_type == issue_type).first()
        if clash:
            raise HTTPException(
                status_code=409,
                detail=f"A runbook for issue_type '{issue_type}' already exists (#{clash.id}). Edit it instead.",
            )
    rb = RunbookEntry(is_seeded=True)
    _apply_runbook_payload(rb, payload)
    db.add(rb)
    db.commit()
    db.refresh(rb)
    _mirror_runbook(rb)
    return RunbookEntryOut.model_validate(rb)


@router.put("/runbooks/{runbook_id}", response_model=RunbookEntryOut)
def update_runbook(runbook_id: int, payload: RunbookWrite, db: Session = Depends(get_db)):
    """Edit an existing runbook (seeded or learned)."""
    rb = db.query(RunbookEntry).filter(RunbookEntry.id == runbook_id).first()
    if not rb:
        raise HTTPException(status_code=404, detail="Runbook not found")
    if not payload.title.strip() or not payload.problem_pattern.strip():
        raise HTTPException(status_code=422, detail="title and problem_pattern are required")
    issue_type = _normalize_issue_type(payload.issue_type)
    if issue_type:
        clash = (
            db.query(RunbookEntry)
            .filter(RunbookEntry.issue_type == issue_type, RunbookEntry.id != runbook_id)
            .first()
        )
        if clash:
            raise HTTPException(
                status_code=409,
                detail=f"A runbook for issue_type '{issue_type}' already exists (#{clash.id}).",
            )
    _apply_runbook_payload(rb, payload)
    db.commit()
    db.refresh(rb)
    _mirror_runbook(rb)
    return RunbookEntryOut.model_validate(rb)


@router.delete("/runbooks/{runbook_id}")
def delete_runbook(runbook_id: int, db: Session = Depends(get_db)):
    """Delete a runbook from the DB and the vector store.

    The 8 built-in canonical runbooks are recreated by the startup seeder, so
    deleting them is pointless — those are blocked. Admin-authored seeded
    runbooks (custom issue_type) and learned ones are deletable.
    """
    from app.database.runbook_seed import ISSUE_PROFILES as _CANONICAL

    rb = db.query(RunbookEntry).filter(RunbookEntry.id == runbook_id).first()
    if not rb:
        raise HTTPException(status_code=404, detail="Runbook not found")
    if rb.issue_type and rb.issue_type in _CANONICAL:
        raise HTTPException(
            status_code=400,
            detail="Built-in canonical runbooks are recreated on startup and can't be deleted. Edit it instead.",
        )
    db.delete(rb)
    db.commit()
    # Drop from the vector store too so RAG stops surfacing it.
    try:
        from app.memory.vector_store import get_memory
        get_memory().delete_runbook(runbook_id)
    except Exception as exc:
        logger.warning("Vector store cleanup for runbook %d failed: %s", runbook_id, exc)
    return {"message": f"Deleted runbook {runbook_id}", "id": runbook_id}


# Same self-emitted markers used by the CloudWatch ingest filter. Lines whose
# message body contains any of these were almost certainly emitted by iTOps
# itself — keeping them in the log store creates a feedback loop where the
# monitoring agent flags real EC2 hosts as critical based on iTOps' own
# anomaly-detection log lines.
_SELF_LOG_MARKERS_SQL = (
    "itops-backend",
    "[itops]",
    "itops.cloudwatch",
    "itops.simulator",
    "itops.pipeline",
    "uvicorn",
)


@router.post("/logs/purge-self-emitted")
def purge_self_emitted_logs(db: Session = Depends(get_db)):
    """One-shot cleanup: delete LogEntry rows that came from iTOps' own output.

    The CloudWatch adapter now skips these at ingest, but rows stored before
    that fix landed need to be purged so the monitoring agent stops reading
    them back as 'critical evidence'.
    """
    from sqlalchemy import or_
    q = db.query(LogEntry).filter(
        or_(*[LogEntry.message.ilike(f"%{m}%") for m in _SELF_LOG_MARKERS_SQL])
    )
    count = q.count()
    q.delete(synchronize_session=False)
    db.commit()
    logger.info("Purged %d self-emitted log entries", count)
    return {"deleted": count}


@router.get("/memory/search")
def search_memory(query: str, collection: str = "incidents", n: int = 5):
    """Search the institutional memory (vector store) via RAG."""
    from app.memory.vector_store import get_memory
    memory = get_memory()
    if collection == "runbooks":
        results = memory.search_runbooks(query, n_results=n)
    else:
        results = memory.search_similar_incidents(query, n_results=n)
    return {"query": query, "collection": collection, "results": results}
