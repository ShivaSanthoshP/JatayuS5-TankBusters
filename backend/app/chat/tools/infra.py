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
