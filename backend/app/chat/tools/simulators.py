from __future__ import annotations
"""Simulator tools for the SRE Copilot."""

from sqlalchemy.orm import Session

from app.chat.schemas import SafetyLevel, ToolInput, ToolOutput
from app.database.models import Simulator


class SimulatorSummary(ToolOutput):
    id: int
    name: str
    simulator_type: str
    status: str


class ListSimulatorsIn(ToolInput):
    status: str | None = None


class ListSimulatorsOut(ToolOutput):
    total: int
    simulators: list[SimulatorSummary]


def _sim_summary(s) -> SimulatorSummary:
    return SimulatorSummary(
        id=s.id, name=s.name,
        simulator_type=s.simulator_type.value if hasattr(s.simulator_type, "value")
                       else str(s.simulator_type),
        status=s.status.value if hasattr(s.status, "value") else str(s.status),
    )


class ListSimulatorsTool:
    name = "list_simulators"
    description = "List all simulators with their type and status."
    input_model = ListSimulatorsIn
    output_model = ListSimulatorsOut
    safety = SafetyLevel.SAFE

    def preview(self, args):
        return ""

    def execute(self, args: ListSimulatorsIn, *, db: Session, idempotency_key: str) -> ListSimulatorsOut:
        rows = db.query(Simulator).order_by(Simulator.name).all()
        if args.status:
            rows = [s for s in rows
                    if (s.status.value if hasattr(s.status, "value") else str(s.status)) == args.status]
        return ListSimulatorsOut(total=len(rows), simulators=[_sim_summary(s) for s in rows])
