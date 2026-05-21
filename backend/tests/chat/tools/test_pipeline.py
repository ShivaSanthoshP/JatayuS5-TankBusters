from unittest.mock import patch

from app.chat.tools.pipeline import (
    RunPipelineTool, RunPipelineIn,
    RunPipelineBatchTool, RunPipelineBatchIn,
    ListRecentPipelineRunsTool, ListRecentPipelineRunsIn,
)
from app.database.session import SessionLocal, init_db
from app.database.models import InfrastructureNode


def _seed(db):
    db.add_all([
        InfrastructureNode(node_name="prod-api-1", node_type="server", provider="aws",
                           region="us-east-1", status="critical", ip_address="10.0.0.1"),
        InfrastructureNode(node_name="prod-api-2", node_type="server", provider="aws",
                           region="us-east-1", status="critical", ip_address="10.0.0.2"),
        InfrastructureNode(node_name="prod-db-1", node_type="database", provider="aws",
                           region="us-east-1", status="healthy", ip_address="10.0.0.3"),
    ])
    db.commit()


def test_run_pipeline_kicks_off():
    init_db()
    with SessionLocal() as db:
        _seed(db)
        with patch("app.chat.tools.pipeline._trigger_pipeline", return_value="run-abc"):
            out = RunPipelineTool().execute(
                RunPipelineIn(node_name="prod-api-1"), db=db, idempotency_key="k1")
        assert out.run_id == "run-abc"
        assert out.node_name == "prod-api-1"


def test_run_pipeline_unknown_node():
    init_db()
    with SessionLocal() as db:
        _seed(db)
        try:
            RunPipelineTool().execute(
                RunPipelineIn(node_name="ghost"), db=db, idempotency_key="k")
            assert False, "expected ValueError"
        except ValueError:
            pass


def test_run_pipeline_batch_fans_out():
    init_db()
    with SessionLocal() as db:
        _seed(db)
        with patch("app.chat.tools.pipeline._trigger_pipeline", return_value="run-x"):
            out = RunPipelineBatchTool().execute(
                RunPipelineBatchIn(status="critical"), db=db, idempotency_key="k2")
        assert out.triggered == 2
        assert set(out.node_names) == {"prod-api-1", "prod-api-2"}


def test_list_recent_returns_empty_when_none():
    init_db()
    with patch("app.chat.tools.pipeline._pipeline_runs", {}):
        out = ListRecentPipelineRunsTool().execute(
            ListRecentPipelineRunsIn(), db=None, idempotency_key="k3")
    assert out.total == 0
