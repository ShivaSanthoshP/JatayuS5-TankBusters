from types import SimpleNamespace

from app.data_sources.azure_monitor import _app_gateway_to_event, _sql_to_event
from app.data_sources.gcp_monitoring import _extract_value


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
