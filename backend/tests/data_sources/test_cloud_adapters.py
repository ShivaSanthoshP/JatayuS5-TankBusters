from types import SimpleNamespace

from app.data_sources.azure_monitor import _app_gateway_to_event, _sql_to_event, _vm_to_event
from app.data_sources.base import MetricEvent
from app.data_sources.gcp_monitoring import GCPMonitoringDataSource, _extract_value
from app.database.models import InfrastructureNode
from app.database.session import SessionLocal, init_db
from app.services.infra_service import InfraService


def _azure_results(metric_map: dict[str, float], *, total_metrics: set[str] | None = None):
    total_metrics = total_metrics or set()
    metrics = []
    for name, value in metric_map.items():
        point = SimpleNamespace(
            average=None if name in total_metrics else value,
            total=value if name in total_metrics else None,
            count=None,
        )
        metrics.append(SimpleNamespace(name=name, timeseries=[SimpleNamespace(data=[point])]))
    return SimpleNamespace(metrics=metrics)


def test_azure_sql_event_maps_db_shape():
    results = _azure_results({
        "cpu_percent": 47.5,
        "storage_percent": 68.0,
        "connection_successful": 120.0,
        "connection_failed": 30.0,
    })

    event = _sql_to_event("/subs/x/sql/db1", "db1", "eastus", results)

    assert event.node_type == "database"
    assert event.provider == "azure"
    assert event.cpu_percent == 47.5
    assert event.disk_percent == 68.0
    assert event.request_rate == 120.0
    assert event.error_rate == 20.0


def test_azure_gateway_event_maps_lb_shape():
    results = _azure_results(
        {
            "TotalRequests": 200.0,
            "FailedRequests": 10.0,
            "CurrentConnections": 40.0,
            "Throughput": 8_000_000.0,
        },
        total_metrics={"TotalRequests", "FailedRequests", "Throughput"},
    )

    event = _app_gateway_to_event("/subs/x/appgw/gw1", "gw1", "eastus", results)

    assert event.node_type == "load_balancer"
    assert event.provider == "azure"
    assert event.request_rate == 200.0
    assert event.error_rate == 5.0
    assert event.network_in_mbps == 64.0


def test_gcp_extract_value_uses_distribution_mean_and_metric_labels():
    point = SimpleNamespace(
        value=SimpleNamespace(
            double_value=None,
            int64_value=None,
            distribution_value=SimpleNamespace(mean=187.0),
        )
    )
    series = SimpleNamespace(
        points=[point],
        resource=SimpleNamespace(labels={"project_id": "p1"}),
        metric=SimpleNamespace(labels={"url_map_name": "lb-prod"}),
    )

    extracted = _extract_value(series, key_candidates=("url_map_name", "forwarding_rule_name"))

    assert extracted == ("lb-prod", 187.0)


def test_azure_vm_event_omits_memory_metric_when_monitor_does_not_return_it():
    results = _azure_results({
        "Percentage CPU": 62.5,
        "Network In Total": 120_000_000.0,
        "Network Out Total": 60_000_000.0,
    })

    event = _vm_to_event("/subs/x/vm/vm1", "vm1", "centralindia", results)

    assert event.memory_percent == 0.0
    assert event.metadata["measured_metrics"] == ["cpu_percent", "network_in_mbps", "network_out_mbps"]


def test_gcp_cloudsql_event_normalizes_disk_usage_into_canonical_disk_percent():
    ds = GCPMonitoringDataSource()
    ds._project_id = "proj-x"
    ds._zone = "asia-south1-a"

    def _fake_query(metric_type: str, **_kwargs):
        if metric_type == "cloudsql.googleapis.com/database/cpu/utilization":
            return {"sql-prod": 0.42}
        if metric_type == "cloudsql.googleapis.com/database/network/connections":
            return {"sql-prod": 88.0}
        if metric_type == "cloudsql.googleapis.com/database/disk/bytes_used":
            return {"sql-prod": 50 * 1024 ** 3}
        return {}

    ds._query_metric_map = _fake_query  # type: ignore[method-assign]

    [event] = ds._cloudsql_events()

    assert event.node_type == "database"
    assert event.cpu_percent == 42.0
    assert event.disk_percent == 50.0
    assert "disk_percent" in event.metadata["measured_metrics"]


def test_infra_service_refreshes_existing_node_shape_from_cloud_event():
    init_db()
    with SessionLocal() as db:
        db.add(
            InfrastructureNode(
                node_name="cloud-node-1",
                node_type="server",
                provider="aws",
                region="us-east-1",
                ip_address="",
                status="healthy",
                metadata_={"data_source": "aws", "measured_metrics": ["cpu_percent"]},
            )
        )
        db.commit()

        event = MetricEvent(
            node_name="cloud-node-1",
            node_type="database",
            provider="gcp",
            region="asia-south1-a",
            ip_address="10.2.3.4",
            cpu_percent=42.0,
            memory_percent=0.0,
            disk_percent=50.0,
            network_in_mbps=0.0,
            network_out_mbps=0.0,
            request_rate=88.0,
            error_rate=0.0,
            latency_ms=0.0,
            metadata={"data_source": "gcp", "measured_metrics": ["cpu_percent", "disk_percent", "request_rate"]},
        )

        node = InfraService(db).ensure_node_exists(event)
        db.commit()

        assert node.node_type == "database"
        assert node.provider == "gcp"
        assert node.region == "asia-south1-a"
        assert node.ip_address == "10.2.3.4"
        assert node.metadata_["data_source"] == "gcp"
        assert node.metadata_["measured_metrics"] == ["cpu_percent", "disk_percent", "request_rate"]
