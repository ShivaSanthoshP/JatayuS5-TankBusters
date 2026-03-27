from __future__ import annotations
"""Service layer for simulator management."""

import logging
from sqlalchemy.orm import Session

from app.database.models import Simulator, SimulatorStatus, SimulatorType

logger = logging.getLogger("itops.simulator_service")


class SimulatorService:
    """Manages simulator instances and their log playback state."""

    def __init__(self, db: Session):
        self.db = db

    def create_simulator(
        self,
        name: str,
        simulator_type: str,
        log_content: str | None,
        interval: int,
    ) -> Simulator:
        """Create a new simulator instance."""
        total_lines = len(log_content.strip().split('\n')) if log_content else 0
        sim = Simulator(
            name=name,
            simulator_type=SimulatorType(simulator_type),
            log_file_content=log_content,
            interval_seconds=interval,
            total_lines=total_lines,
            status=SimulatorStatus.STOPPED,
        )
        self.db.add(sim)
        self.db.commit()
        self.db.refresh(sim)
        logger.info(f"Created simulator: {sim.name} with {total_lines} lines")
        return sim

    def get_simulator(self, simulator_id: int) -> Simulator | None:
        """Get a simulator by ID."""
        return self.db.query(Simulator).get(simulator_id)

    def get_simulator_by_name(self, name: str) -> Simulator | None:
        """Get a simulator by name."""
        return self.db.query(Simulator).filter(Simulator.name == name).first()

    def get_simulators(self, limit: int = 50) -> list[Simulator]:
        """Get all simulators ordered by creation date."""
        return (
            self.db.query(Simulator)
            .order_by(Simulator.created_at.desc())
            .limit(limit)
            .all()
        )

    def update_simulator(self, simulator_id: int, **kwargs) -> Simulator | None:
        """Update a simulator's fields."""
        sim = self.get_simulator(simulator_id)
        if not sim:
            return None
        for key, value in kwargs.items():
            if value is not None and hasattr(sim, key):
                setattr(sim, key, value)
        self.db.commit()
        self.db.refresh(sim)
        return sim

    def delete_simulator(self, simulator_id: int) -> bool:
        """Delete a simulator."""
        sim = self.get_simulator(simulator_id)
        if not sim:
            return False
        self.db.delete(sim)
        self.db.commit()
        logger.info(f"Deleted simulator: {sim.name}")
        return True

    def set_status(self, simulator_id: int, status: SimulatorStatus) -> Simulator | None:
        """Set a simulator's status."""
        sim = self.get_simulator(simulator_id)
        if not sim:
            return None
        sim.status = status
        if status == SimulatorStatus.STOPPED:
            sim.current_line_index = 0  # Reset position on stop
        self.db.commit()
        self.db.refresh(sim)
        logger.info(f"Simulator {sim.name} status changed to {status.value}")
        return sim

    def reset_position(self, simulator_id: int) -> Simulator | None:
        """Reset a simulator's playback position to the beginning."""
        sim = self.get_simulator(simulator_id)
        if not sim:
            return None
        sim.current_line_index = 0
        self.db.commit()
        self.db.refresh(sim)
        logger.info(f"Simulator {sim.name} position reset to 0")
        return sim

    def advance_line(self, simulator_id: int) -> tuple[str | None, bool]:
        """
        Advance to the next line and return it.

        Returns:
            tuple: (line_content, is_finished)
        """
        sim = self.get_simulator(simulator_id)
        if not sim or not sim.log_file_content:
            return None, True

        lines = sim.log_file_content.strip().split('\n')
        if sim.current_line_index >= len(lines):
            return None, True

        line = lines[sim.current_line_index]
        sim.current_line_index += 1
        self.db.commit()

        is_finished = sim.current_line_index >= len(lines)
        return line, is_finished

    def seed_fleet_simulators(self, fleet_nodes: list[dict]) -> int:
        """
        Create metrics-type simulator records for fleet nodes that don't already exist.
        Called on startup so auto-generated fleet nodes appear in the Simulators page.
        Returns the number of new records created.
        """
        created = 0
        for node in fleet_nodes:
            existing = self.get_simulator_by_name(node["name"])
            if not existing:
                sim = Simulator(
                    name=node["name"],
                    simulator_type=SimulatorType.METRICS,
                    status=SimulatorStatus.RUNNING,
                    interval_seconds=0,
                    total_lines=0,
                    metrics_enabled=True,
                    metrics_config={},
                )
                self.db.add(sim)
                created += 1
        if created:
            self.db.commit()
            logger.info(f"Seeded {created} fleet metrics simulators")
        return created

    def get_current_line(self, simulator_id: int) -> str | None:
        """Get the current line without advancing the position."""
        sim = self.get_simulator(simulator_id)
        if not sim or not sim.log_file_content:
            return None

        lines = sim.log_file_content.strip().split('\n')
        if sim.current_line_index >= len(lines):
            return None

        return lines[sim.current_line_index]
