from __future__ import annotations
"""Simulator management API routes."""

import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.database.models import SimulatorStatus
from app.api.schemas import SimulatorOut, SimulatorAction, SimulatorMetricsUpdate
from app.services.simulator_service import SimulatorService

logger = logging.getLogger("itops.simulators")

router = APIRouter(prefix="/simulators", tags=["Simulators"])


def _to_out(sim) -> SimulatorOut:
    """Convert a Simulator model to SimulatorOut schema."""
    return SimulatorOut(
        id=sim.id,
        name=sim.name,
        simulator_type=sim.simulator_type.value if sim.simulator_type else "vm",
        status=sim.status.value if sim.status else "stopped",
        log_file_content=sim.log_file_content,
        interval_seconds=sim.interval_seconds,
        current_line_index=sim.current_line_index,
        total_lines=sim.total_lines,
        metrics_enabled=sim.metrics_enabled or False,
        metrics_config=sim.metrics_config or {},
        created_at=sim.created_at,
        updated_at=sim.updated_at,
    )


@router.get("/", response_model=list[SimulatorOut])
def list_simulators(limit: int = 50, db: Session = Depends(get_db)):
    """List all simulators."""
    svc = SimulatorService(db)
    simulators = svc.get_simulators(limit=limit)
    return [_to_out(s) for s in simulators]


@router.get("/{simulator_id}", response_model=SimulatorOut)
def get_simulator(simulator_id: int, db: Session = Depends(get_db)):
    """Get a specific simulator by ID."""
    svc = SimulatorService(db)
    sim = svc.get_simulator(simulator_id)
    if not sim:
        raise HTTPException(status_code=404, detail="Simulator not found")
    return _to_out(sim)


@router.post("/", response_model=SimulatorOut)
async def create_simulator(
    name: str = Form(...),
    simulator_type: str = Form(...),
    interval_seconds: int = Form(5),
    log_file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    """
    Create a new simulator with optional log file upload.

    The log file content is stored directly in the database.
    """
    svc = SimulatorService(db)

    # Validate simulator type
    valid_types = ("vm", "db", "cache", "load_balancer", "queue", "metrics")
    if simulator_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid simulator_type. Must be one of: {', '.join(valid_types)}"
        )

    # Check for duplicate name
    existing = svc.get_simulator_by_name(name)
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Simulator with this name already exists"
        )

    # Read log file content if provided
    log_content = None
    if log_file:
        try:
            content = await log_file.read()
            log_content = content.decode('utf-8')
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=400,
                detail="Log file must be a valid UTF-8 text file"
            )

    sim = svc.create_simulator(
        name=name,
        simulator_type=simulator_type,
        log_content=log_content,
        interval=interval_seconds,
    )
    return _to_out(sim)


@router.delete("/{simulator_id}")
def delete_simulator(simulator_id: int, db: Session = Depends(get_db)):
    """Delete a simulator."""
    svc = SimulatorService(db)
    if not svc.delete_simulator(simulator_id):
        raise HTTPException(status_code=404, detail="Simulator not found")
    return {"status": "deleted"}


@router.post("/{simulator_id}/action", response_model=SimulatorOut)
def simulator_action(
    simulator_id: int,
    body: SimulatorAction,
    db: Session = Depends(get_db),
):
    """
    Control a simulator: start, stop, pause, or reset.

    - start: Begin or resume log playback
    - stop: Stop playback and reset position to beginning
    - pause: Pause playback at current position
    - reset: Reset playback position to beginning without changing status
    """
    svc = SimulatorService(db)
    sim = svc.get_simulator(simulator_id)
    if not sim:
        raise HTTPException(status_code=404, detail="Simulator not found")

    status_map = {
        "start": SimulatorStatus.RUNNING,
        "stop": SimulatorStatus.STOPPED,
        "pause": SimulatorStatus.PAUSED,
    }

    if body.action == "reset":
        sim = svc.reset_position(simulator_id)
    elif body.action in status_map:
        sim = svc.set_status(simulator_id, status_map[body.action])

    return _to_out(sim)


@router.put("/{simulator_id}/metrics", response_model=SimulatorOut)
def update_metrics(
    simulator_id: int,
    body: SimulatorMetricsUpdate,
    db: Session = Depends(get_db),
):
    """Enable/disable performance metrics and set their values."""
    svc = SimulatorService(db)
    sim = svc.get_simulator(simulator_id)
    if not sim:
        raise HTTPException(status_code=404, detail="Simulator not found")
    sim.metrics_enabled = body.metrics_enabled
    sim.metrics_config = body.metrics_config
    db.commit()
    db.refresh(sim)
    return _to_out(sim)
