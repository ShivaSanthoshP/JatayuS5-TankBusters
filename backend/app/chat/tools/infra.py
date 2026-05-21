from __future__ import annotations
"""Infrastructure read tools for the SRE Copilot."""

from typing import Literal

from pydantic import Field
from sqlalchemy.orm import Session

from app.chat.schemas import SafetyLevel, ToolInput, ToolOutput
from app.database.models import (
    InfrastructureNode, LogEntry, MetricSnapshot, Incident,
)


class NodeSummary(ToolOutput):
    node_name: str
    node_type: str
    provider: str
    region: str
    status: str
    ip_address: str = ""
    data_source: str | None = None


class ListNodesIn(ToolInput):
    status: Literal["critical", "degraded", "healthy", "offline"] | None = Field(
        default=None, description="Filter by node status. Omit for all.")
    node_type: str | None = Field(
        default=None, description="Filter by node type (server, database, cache, load_balancer, queue).")
    source: str | None = Field(
        default=None, description="Filter by data source: 'simulated', 'aws', etc.")


class ListNodesOut(ToolOutput):
    total: int
    nodes: list[NodeSummary]


class ListNodesTool:
    name = "list_nodes"
    description = (
        "List infrastructure nodes with optional filters. Use this to find nodes by "
        "status (e.g. 'all critical nodes'), type (e.g. 'all databases'), or source "
        "(e.g. 'AWS CloudWatch nodes'). Always call this before any tool that needs a "
        "node_name — never guess names."
    )
    input_model = ListNodesIn
    output_model = ListNodesOut
    safety = SafetyLevel.SAFE

    def preview(self, args):
        return ""

    def execute(self, args: ListNodesIn, *, db: Session, idempotency_key: str) -> ListNodesOut:
        q = db.query(InfrastructureNode)
        if args.status:
            q = q.filter(InfrastructureNode.status == args.status)
        if args.node_type:
            q = q.filter(InfrastructureNode.node_type == args.node_type)
        rows = q.order_by(InfrastructureNode.node_name).all()
        if args.source:
            rows = [r for r in rows
                    if ((r.metadata_ or {}).get("data_source") or r.provider) == args.source]
        return ListNodesOut(
            total=len(rows),
            nodes=[
                NodeSummary(
                    node_name=r.node_name, node_type=r.node_type, provider=r.provider,
                    region=r.region or "", status=r.status, ip_address=r.ip_address or "",
                    data_source=(r.metadata_ or {}).get("data_source"),
                ) for r in rows
            ],
        )


# ── get_node ────────────────────────────────────────────────────────

class GetNodeIn(ToolInput):
    node_name: str


class GetNodeOut(ToolOutput):
    node: NodeSummary


class GetNodeTool:
    name = "get_node"
    description = (
        "Get the current status of one node by exact node_name. "
        "Use list_nodes first if you don't know the name."
    )
    input_model = GetNodeIn
    output_model = GetNodeOut
    safety = SafetyLevel.SAFE

    def preview(self, args):
        return ""

    def execute(self, args: GetNodeIn, *, db: Session, idempotency_key: str) -> GetNodeOut:
        r = db.query(InfrastructureNode).filter_by(node_name=args.node_name).one_or_none()
        if r is None:
            raise ValueError(f"Node not found: {args.node_name}")
        return GetNodeOut(node=NodeSummary(
            node_name=r.node_name, node_type=r.node_type, provider=r.provider,
            region=r.region or "", status=r.status, ip_address=r.ip_address or "",
            data_source=(r.metadata_ or {}).get("data_source"),
        ))


# ── get_node_logs ───────────────────────────────────────────────────

class LogLine(ToolOutput):
    timestamp: str | None
    level: str
    source: str
    message: str


class GetNodeLogsIn(ToolInput):
    node_name: str
    limit: int = 50


class GetNodeLogsOut(ToolOutput):
    node_name: str
    total: int
    logs: list[LogLine]


class GetNodeLogsTool:
    name = "get_node_logs"
    description = (
        "Recent log lines stored for a node, newest first. Use after "
        "list_nodes/get_node to investigate a specific host."
    )
    input_model = GetNodeLogsIn
    output_model = GetNodeLogsOut
    safety = SafetyLevel.SAFE

    def preview(self, args):
        return ""

    def execute(self, args: GetNodeLogsIn, *, db: Session, idempotency_key: str) -> GetNodeLogsOut:
        node = db.query(InfrastructureNode).filter_by(node_name=args.node_name).one_or_none()
        if node is None:
            raise ValueError(f"Node not found: {args.node_name}")
        rows = (db.query(LogEntry).filter_by(node_id=node.id)
                .order_by(LogEntry.timestamp.desc()).limit(args.limit).all())
        return GetNodeLogsOut(
            node_name=args.node_name, total=len(rows),
            logs=[LogLine(
                timestamp=r.timestamp.isoformat() if r.timestamp else None,
                level=r.level, source=r.source, message=r.message,
            ) for r in rows],
        )


# ── get_node_metrics ────────────────────────────────────────────────

class MetricPoint(ToolOutput):
    timestamp: str | None
    cpu_percent: float
    memory_percent: float
    disk_percent: float
    error_rate: float
    latency_ms: float


class GetNodeMetricsIn(ToolInput):
    node_name: str
    limit: int = 30


class GetNodeMetricsOut(ToolOutput):
    node_name: str
    snapshots: list[MetricPoint]


class GetNodeMetricsTool:
    name = "get_node_metrics"
    description = (
        "Most recent metric snapshots for a node, newest first. "
        "Use to diagnose 'why is X critical?'"
    )
    input_model = GetNodeMetricsIn
    output_model = GetNodeMetricsOut
    safety = SafetyLevel.SAFE

    def preview(self, args):
        return ""

    def execute(self, args: GetNodeMetricsIn, *, db: Session, idempotency_key: str) -> GetNodeMetricsOut:
        node = db.query(InfrastructureNode).filter_by(node_name=args.node_name).one_or_none()
        if node is None:
            raise ValueError(f"Node not found: {args.node_name}")
        rows = (db.query(MetricSnapshot).filter_by(node_id=node.id)
                .order_by(MetricSnapshot.timestamp.desc()).limit(args.limit).all())
        return GetNodeMetricsOut(
            node_name=args.node_name,
            snapshots=[MetricPoint(
                timestamp=r.timestamp.isoformat() if r.timestamp else None,
                cpu_percent=r.cpu_percent or 0.0, memory_percent=r.memory_percent or 0.0,
                disk_percent=r.disk_percent or 0.0, error_rate=r.error_rate or 0.0,
                latency_ms=r.latency_ms or 0.0,
            ) for r in rows],
        )


# ── incidents ───────────────────────────────────────────────────────

class IncidentSummary(ToolOutput):
    id: int
    node_name: str
    title: str
    severity: str
    status: str
    description: str
    created_at: str | None


class ListIncidentsIn(ToolInput):
    status: Literal["detected", "analyzing", "diagnosed", "awaiting_approval",
                    "remediating", "resolved", "escalated", "failed"] | None = None
    severity: Literal["low", "medium", "high", "critical"] | None = None
    limit: int = 25


class ListIncidentsOut(ToolOutput):
    total: int
    incidents: list[IncidentSummary]


def _incident_summary(r) -> "IncidentSummary":
    return IncidentSummary(
        id=r.id,
        node_name=(r.node.node_name if r.node else "unknown"),
        title=r.title or "",
        severity=r.severity.value if hasattr(r.severity, "value") else str(r.severity),
        status=r.status.value if hasattr(r.status, "value") else str(r.status),
        description=r.description or "",
        created_at=r.created_at.isoformat() if r.created_at else None,
    )


class ListIncidentsTool:
    name = "list_incidents"
    description = (
        "List incidents with optional status/severity filters. "
        "Use to answer 'what incidents happened today?'"
    )
    input_model = ListIncidentsIn
    output_model = ListIncidentsOut
    safety = SafetyLevel.SAFE

    def preview(self, args):
        return ""

    def execute(self, args: ListIncidentsIn, *, db: Session, idempotency_key: str) -> ListIncidentsOut:
        from app.database.models import IncidentStatus, Severity
        q = db.query(Incident)
        if args.status:
            q = q.filter(Incident.status == IncidentStatus(args.status))
        if args.severity:
            q = q.filter(Incident.severity == Severity(args.severity))
        rows = q.order_by(Incident.created_at.desc()).limit(args.limit).all()
        return ListIncidentsOut(total=len(rows),
                                incidents=[_incident_summary(r) for r in rows])


class GetIncidentIn(ToolInput):
    incident_id: int


class GetIncidentOut(ToolOutput):
    incident: IncidentSummary
    root_cause: str | None = None


class GetIncidentTool:
    name = "get_incident"
    description = "Fetch a single incident's details by id, including root cause if set."
    input_model = GetIncidentIn
    output_model = GetIncidentOut
    safety = SafetyLevel.SAFE

    def preview(self, args):
        return ""

    def execute(self, args: GetIncidentIn, *, db: Session, idempotency_key: str) -> GetIncidentOut:
        r = db.query(Incident).filter_by(id=args.incident_id).one_or_none()
        if r is None:
            raise ValueError(f"Incident not found: {args.incident_id}")
        return GetIncidentOut(incident=_incident_summary(r), root_cause=r.root_cause)


# ── dashboard overview ──────────────────────────────────────────────

class GetDashboardOverviewIn(ToolInput):
    pass


class GetDashboardOverviewOut(ToolOutput):
    total_nodes: int
    critical_nodes: int
    degraded_nodes: int
    healthy_nodes: int
    open_incidents: int


class GetDashboardOverviewTool:
    name = "get_dashboard_overview"
    description = (
        "One-shot summary of the system: node counts by status plus open "
        "incident count. Best opener for 'what's going on'."
    )
    input_model = GetDashboardOverviewIn
    output_model = GetDashboardOverviewOut
    safety = SafetyLevel.SAFE

    def preview(self, args):
        return ""

    def execute(self, args: GetDashboardOverviewIn, *, db: Session, idempotency_key: str) -> GetDashboardOverviewOut:
        from app.database.models import IncidentStatus
        nodes = db.query(InfrastructureNode).all()
        open_incidents = (db.query(Incident)
                          .filter(Incident.status != IncidentStatus.RESOLVED)
                          .count())
        return GetDashboardOverviewOut(
            total_nodes=len(nodes),
            critical_nodes=sum(1 for n in nodes if n.status == "critical"),
            degraded_nodes=sum(1 for n in nodes if n.status == "degraded"),
            healthy_nodes=sum(1 for n in nodes if n.status == "healthy"),
            open_incidents=open_incidents,
        )
