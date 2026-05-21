from app.chat.tools.infra import ListNodesTool, ListNodesIn, ListNodesOut
from app.database.session import SessionLocal, init_db
from app.database.models import InfrastructureNode


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
