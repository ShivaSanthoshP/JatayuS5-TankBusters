from app.chat.tools.simulators import (
    ControlSimulatorTool, ControlSimulatorIn,
    DeleteSimulatorTool, DeleteSimulatorIn,
)
from app.database.session import SessionLocal, init_db
from app.database.models import Simulator, SimulatorStatus, SimulatorType


def _seed_sim(db):
    sim = Simulator(name="kafka-1", simulator_type=SimulatorType.METRICS,
                    status=SimulatorStatus.RUNNING)
    db.add(sim)
    db.commit()
    return sim


def test_control_simulator_pause():
    init_db()
    with SessionLocal() as db:
        _seed_sim(db)
        out = ControlSimulatorTool().execute(
            ControlSimulatorIn(sim_name="kafka-1", action="pause"),
            db=db, idempotency_key="k")
        assert out.sim_name == "kafka-1"
        assert out.applied_action == "pause"
        assert out.new_status == "paused"


def test_control_simulator_unknown():
    init_db()
    with SessionLocal() as db:
        try:
            ControlSimulatorTool().execute(
                ControlSimulatorIn(sim_name="ghost", action="stop"),
                db=db, idempotency_key="k")
            assert False, "expected ValueError"
        except ValueError:
            pass


def test_delete_simulator_is_risky_and_previews():
    init_db()
    with SessionLocal() as db:
        _seed_sim(db)
        tool = DeleteSimulatorTool()
        assert tool.safety.value == "risky"
        prev = tool.preview(DeleteSimulatorIn(sim_name="kafka-1"))
        assert "kafka-1" in prev


def test_delete_simulator_removes_row():
    init_db()
    with SessionLocal() as db:
        _seed_sim(db)
        out = DeleteSimulatorTool().execute(
            DeleteSimulatorIn(sim_name="kafka-1"), db=db, idempotency_key="k")
        assert out.deleted is True
        assert db.query(Simulator).filter_by(name="kafka-1").first() is None
