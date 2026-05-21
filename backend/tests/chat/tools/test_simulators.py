from app.chat.tools.simulators import ListSimulatorsTool, ListSimulatorsIn
from app.database.session import SessionLocal, init_db
from app.database.models import Simulator, SimulatorStatus, SimulatorType


def test_list_simulators():
    init_db()
    with SessionLocal() as db:
        db.add(Simulator(name="kafka-1", simulator_type=SimulatorType.METRICS,
                         status=SimulatorStatus.RUNNING))
        db.commit()
        out = ListSimulatorsTool().execute(ListSimulatorsIn(), db=db, idempotency_key="k")
        assert any(s.name == "kafka-1" for s in out.simulators)
