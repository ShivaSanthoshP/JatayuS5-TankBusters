from unittest.mock import patch

from app.chat.tools.datasources import (
    ListDataSourcesTool, ListDataSourcesIn,
    DataSourceConnCheckTool, DataSourceConnCheckIn,
    DisconnectDataSourceTool, DisconnectDataSourceIn,
)
from app.database.session import SessionLocal, init_db


def test_list_data_sources_returns_simulator_at_minimum():
    init_db()
    with SessionLocal() as db:
        out = ListDataSourcesTool().execute(
            ListDataSourcesIn(), db=db, idempotency_key="k")
        assert any(s.provider == "simulated" for s in out.sources)


def test_disconnect_is_risky_and_previews():
    tool = DisconnectDataSourceTool()
    assert tool.safety.value == "risky"
    p = tool.preview(DisconnectDataSourceIn(provider="aws"))
    assert "aws" in p.lower()


def test_test_connection_simulated_ok():
    init_db()
    with SessionLocal() as db:
        out = DataSourceConnCheckTool().execute(
            DataSourceConnCheckIn(provider="simulated"),
            db=db, idempotency_key="k")
        assert out.ok is True
