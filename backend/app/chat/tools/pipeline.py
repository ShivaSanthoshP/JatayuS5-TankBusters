from __future__ import annotations
"""Pipeline tools for the SRE Copilot."""

import asyncio
import logging
import threading
import uuid as _uuid

from sqlalchemy.orm import Session

from app.chat.schemas import SafetyLevel, ToolInput, ToolOutput
from app.database.models import InfrastructureNode
# The agents route owns the in-memory run store; import the dict object so
# list_recent reflects live state.
from app.api.routes.agents import _pipeline_runs

logger = logging.getLogger("itops.chat.tools.pipeline")


def _schedule(coro) -> None:
    """Run an async pipeline job without blocking the caller.

    Inside an SSE request we are on the event loop thread, so create_task
    works. Outside one (scripts/tests of the real path) we fall back to a
    dedicated thread running its own loop.
    """
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(coro)
    except RuntimeError:
        threading.Thread(target=lambda: asyncio.run(coro), daemon=True).start()


def _trigger_pipeline(node_name: str, db: Session) -> str:
    """Kick off the 5-agent pipeline for one node. Returns the run_id.

    Reuses the exact context-resolution + job machinery the REST route uses
    so chat-triggered runs are indistinguishable from UI-triggered ones.
    """
    from app.api.routes.agents import _resolve_pipeline_context, _register_pipeline_run, _run_pipeline_job
    from app.api.schemas import PipelineRunRequest
    from app.config import utc_now

    body = PipelineRunRequest(node_name=node_name)
    metrics, metric_history, log_history = _resolve_pipeline_context(body, db)
    run_id = _uuid.uuid4().hex
    _register_pipeline_run(run_id, {
        "run_id": run_id,
        "status": "queued",
        "node_name": metrics.get("node_name", node_name),
        "current_agent": None,
        "current_phase": None,
        "progress_events": [],
        "result": None,
        "error": None,
        "started_at": utc_now().isoformat(),
        "completed_at": None,
    })
    _schedule(_run_pipeline_job(run_id, metrics, metric_history, log_history))
    return run_id


# ── run_pipeline ────────────────────────────────────────────────────

class RunPipelineIn(ToolInput):
    node_name: str


class RunPipelineOut(ToolOutput):
    run_id: str
    node_name: str
    message: str


class RunPipelineTool:
    name = "run_pipeline"
    description = (
        "Trigger the 5-agent pipeline on one node. Returns a run_id immediately; "
        "the pipeline runs asynchronously. Use list_recent_pipeline_runs to check progress."
    )
    input_model = RunPipelineIn
    output_model = RunPipelineOut
    safety = SafetyLevel.SAFE

    def preview(self, args):
        return ""

    def execute(self, args: RunPipelineIn, *, db: Session, idempotency_key: str) -> RunPipelineOut:
        if not db.query(InfrastructureNode).filter_by(node_name=args.node_name).first():
            raise ValueError(f"Node not found: {args.node_name}")
        run_id = _trigger_pipeline(args.node_name, db)
        return RunPipelineOut(
            run_id=run_id, node_name=args.node_name,
            message=f"Pipeline kicked off on {args.node_name} (run_id={run_id}).",
        )


# ── run_pipeline_batch ──────────────────────────────────────────────

class RunPipelineBatchIn(ToolInput):
    status: str | None = None
    node_type: str | None = None
    source: str | None = None


class RunPipelineBatchOut(ToolOutput):
    triggered: int
    node_names: list[str]
    run_ids: list[str]


class RunPipelineBatchTool:
    name = "run_pipeline_batch"
    description = (
        "Trigger the pipeline on all nodes matching the given filters "
        "(status/type/source). Use after list_nodes to act on a group."
    )
    input_model = RunPipelineBatchIn
    output_model = RunPipelineBatchOut
    safety = SafetyLevel.SAFE

    def preview(self, args):
        return ""

    def execute(self, args: RunPipelineBatchIn, *, db: Session, idempotency_key: str) -> RunPipelineBatchOut:
        q = db.query(InfrastructureNode)
        if args.status:
            q = q.filter(InfrastructureNode.status == args.status)
        if args.node_type:
            q = q.filter(InfrastructureNode.node_type == args.node_type)
        rows = q.all()
        if args.source:
            rows = [r for r in rows
                    if ((r.metadata_ or {}).get("data_source") or r.provider) == args.source]
        names: list[str] = []
        run_ids: list[str] = []
        for r in rows:
            try:
                rid = _trigger_pipeline(r.node_name, db)
                names.append(r.node_name)
                run_ids.append(rid)
            except Exception as exc:  # noqa: BLE001
                logger.warning("batch pipeline skip %s: %s", r.node_name, exc)
        return RunPipelineBatchOut(triggered=len(names), node_names=names, run_ids=run_ids)


# ── list_recent_pipeline_runs ───────────────────────────────────────

class PipelineRunSummary(ToolOutput):
    run_id: str
    node_name: str
    status: str
    started_at: str | None
    completed_at: str | None


class ListRecentPipelineRunsIn(ToolInput):
    limit: int = 10


class ListRecentPipelineRunsOut(ToolOutput):
    total: int
    runs: list[PipelineRunSummary]


class ListRecentPipelineRunsTool:
    name = "list_recent_pipeline_runs"
    description = "Recent pipeline runs across all nodes, newest first."
    input_model = ListRecentPipelineRunsIn
    output_model = ListRecentPipelineRunsOut
    safety = SafetyLevel.SAFE

    def preview(self, args):
        return ""

    def execute(self, args: ListRecentPipelineRunsIn, *, db, idempotency_key: str) -> ListRecentPipelineRunsOut:
        items = sorted(
            _pipeline_runs.values(),
            key=lambda r: r.get("started_at") or "",
            reverse=True,
        )[:args.limit]
        return ListRecentPipelineRunsOut(
            total=len(items),
            runs=[PipelineRunSummary(
                run_id=r.get("run_id", ""),
                node_name=r.get("node_name", ""),
                status=r.get("status", "unknown"),
                started_at=r.get("started_at"),
                completed_at=r.get("completed_at"),
            ) for r in items],
        )
