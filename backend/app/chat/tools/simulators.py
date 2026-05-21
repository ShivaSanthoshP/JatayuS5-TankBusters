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


# ── control_simulator ───────────────────────────────────────────────

from typing import Literal  # noqa: E402
from app.database.models import SimulatorStatus  # noqa: E402

_ACTION_STATUS = {
    "start":  SimulatorStatus.RUNNING,
    "resume": SimulatorStatus.RUNNING,
    "stop":   SimulatorStatus.STOPPED,
    "pause":  SimulatorStatus.PAUSED,
}


class ControlSimulatorIn(ToolInput):
    sim_name: str
    action: Literal["start", "stop", "pause", "resume"]


class ControlSimulatorOut(ToolOutput):
    sim_name: str
    applied_action: str
    new_status: str


class ControlSimulatorTool:
    name = "control_simulator"
    description = "Start, stop, pause, or resume a simulator by name."
    input_model = ControlSimulatorIn
    output_model = ControlSimulatorOut
    safety = SafetyLevel.SAFE

    def preview(self, args):
        return ""

    def execute(self, args: ControlSimulatorIn, *, db: Session, idempotency_key: str) -> ControlSimulatorOut:
        from app.services.simulator_service import SimulatorService
        svc = SimulatorService(db)
        sim = svc.get_simulator_by_name(args.sim_name)
        if sim is None:
            raise ValueError(f"Simulator not found: {args.sim_name}")
        updated = svc.set_status(sim.id, _ACTION_STATUS[args.action])
        status = updated.status if updated is not None else sim.status
        return ControlSimulatorOut(
            sim_name=args.sim_name, applied_action=args.action,
            new_status=status.value if hasattr(status, "value") else str(status),
        )


# ── delete_simulator (risky) ────────────────────────────────────────

class DeleteSimulatorIn(ToolInput):
    sim_name: str


class DeleteSimulatorOut(ToolOutput):
    sim_name: str
    deleted: bool


class DeleteSimulatorTool:
    name = "delete_simulator"
    description = "Permanently delete a simulator. Risky — cannot be undone."
    input_model = DeleteSimulatorIn
    output_model = DeleteSimulatorOut
    safety = SafetyLevel.RISKY

    def preview(self, args: DeleteSimulatorIn) -> str:
        return f"Permanently delete simulator '{args.sim_name}'. This cannot be undone."

    def execute(self, args: DeleteSimulatorIn, *, db: Session, idempotency_key: str) -> DeleteSimulatorOut:
        from app.services.simulator_service import SimulatorService
        svc = SimulatorService(db)
        sim = svc.get_simulator_by_name(args.sim_name)
        if sim is None:
            return DeleteSimulatorOut(sim_name=args.sim_name, deleted=False)
        ok = svc.delete_simulator(sim.id)
        return DeleteSimulatorOut(sim_name=args.sim_name, deleted=bool(ok))
