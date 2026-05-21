from datetime import datetime, timezone

from app.chat.tools.infra import (
    ListNodesTool, ListNodesIn, ListNodesOut,
    GetNodeTool, GetNodeIn,
    GetNodeLogsTool, GetNodeLogsIn,
    GetNodeMetricsTool, GetNodeMetricsIn,
    ListIncidentsTool, ListIncidentsIn,
    GetIncidentTool, GetIncidentIn,
    GetDashboardOverviewTool, GetDashboardOverviewIn,
)
from app.database.session import SessionLocal, init_db
from app.database.models import (
    InfrastructureNode, LogEntry, MetricSnapshot, Incident,
    Severity, IncidentStatus,
)


def _seed_nodes(db):
    db.add_all([
        InfrastructureNode(node_name="n1", node_type="server", provider="aws",
                           region="ap-south-1", ip_address="", status="critical"),
        InfrastructureNode(node_name="n2", node_type="database", provider="aws",
                           region="us-east-1", ip_address="", status="healthy"),
    ])
    db.commit()


def test_list_nodes_no_filter():
    init_db()
    tool = ListNodesTool()
    with SessionLocal() as db:
        _seed_nodes(db)
        out = tool.execute(ListNodesIn(), db=db, idempotency_key="k1")
        assert isinstance(out, ListNodesOut)
        assert out.total == 2
        names = {n.node_name for n in out.nodes}
        assert names == {"n1", "n2"}


def test_list_nodes_status_filter():
    init_db()
    tool = ListNodesTool()
    with SessionLocal() as db:
        _seed_nodes(db)
        out = tool.execute(ListNodesIn(status="critical"), db=db, idempotency_key="k2")
        assert out.total == 1
        assert out.nodes[0].node_name == "n1"


def test_list_nodes_type_and_source_filter():
    init_db()
    tool = ListNodesTool()
    with SessionLocal() as db:
        _seed_nodes(db)
        out = tool.execute(ListNodesIn(node_type="database", source="aws"),
                           db=db, idempotency_key="k3")
        assert out.total == 1
        assert out.nodes[0].node_name == "n2"


def test_get_node_by_name():
    init_db()
    with SessionLocal() as db:
        _seed_nodes(db)
        out = GetNodeTool().execute(GetNodeIn(node_name="n1"), db=db, idempotency_key="k")
        assert out.node.node_name == "n1"
        assert out.node.status == "critical"


def test_get_node_logs_returns_recent():
    init_db()
    with SessionLocal() as db:
        _seed_nodes(db)
        node = db.query(InfrastructureNode).filter_by(node_name="n1").one()
        db.add(LogEntry(node_id=node.id, timestamp=datetime.now(timezone.utc),
                        level="ERROR", source="syslog", message="something bad"))
        db.commit()
        out = GetNodeLogsTool().execute(
            GetNodeLogsIn(node_name="n1", limit=10), db=db, idempotency_key="k")
        assert len(out.logs) == 1
        assert out.logs[0].level == "ERROR"


def test_get_node_metrics():
    init_db()
    with SessionLocal() as db:
        _seed_nodes(db)
        node = db.query(InfrastructureNode).filter_by(node_name="n1").one()
        db.add(MetricSnapshot(node_id=node.id, cpu_percent=12.5, memory_percent=30.0,
                              disk_percent=40.0, network_in_mbps=0, network_out_mbps=0,
                              request_rate=0, error_rate=0, latency_ms=0))
        db.commit()
        out = GetNodeMetricsTool().execute(
            GetNodeMetricsIn(node_name="n1", limit=10), db=db, idempotency_key="k")
        assert out.snapshots[0].cpu_percent == 12.5


def test_list_incidents():
    init_db()
    with SessionLocal() as db:
        _seed_nodes(db)
        node = db.query(InfrastructureNode).filter_by(node_name="n1").one()
        db.add(Incident(node_id=node.id, severity=Severity.CRITICAL,
                        title="Threshold breach", description="x",
                        status=IncidentStatus.RESOLVED))
        db.commit()
        out = ListIncidentsTool().execute(ListIncidentsIn(), db=db, idempotency_key="k")
        assert out.total >= 1
        assert out.incidents[0].severity == "critical"


def test_get_incident():
    init_db()
    with SessionLocal() as db:
        _seed_nodes(db)
        node = db.query(InfrastructureNode).filter_by(node_name="n1").one()
        db.add(Incident(node_id=node.id, severity=Severity.HIGH,
                        title="Memory pressure", description="x",
                        status=IncidentStatus.DETECTED, root_cause="leak"))
        db.commit()
        inc = db.query(Incident).first()
        out = GetIncidentTool().execute(
            GetIncidentIn(incident_id=inc.id), db=db, idempotency_key="k")
        assert out.incident.title == "Memory pressure"
        assert out.root_cause == "leak"


def test_get_dashboard_overview():
    init_db()
    with SessionLocal() as db:
        _seed_nodes(db)
        out = GetDashboardOverviewTool().execute(
            GetDashboardOverviewIn(), db=db, idempotency_key="k")
        assert out.total_nodes == 2
        assert out.critical_nodes == 1
        assert out.healthy_nodes == 1
