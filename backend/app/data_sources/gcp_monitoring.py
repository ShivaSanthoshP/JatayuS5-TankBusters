from __future__ import annotations
"""
GCP Cloud Monitoring data source.

Queries Compute Engine, Cloud SQL, and HTTPS load-balancer metrics via the
Cloud Monitoring API. Provider-native values are carried in metadata["gcp"].
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator

from app.data_sources.base import DataSource, MetricEvent

logger = logging.getLogger("itops.gcp_monitoring")

_RETRY_DELAYS = (1.0, 2.0, 4.0)


def _extract_value(time_series, *, key_candidates: tuple[str, ...]) -> tuple[str, float] | None:
    try:
        pts = list(time_series.points)
        if not pts:
            return None
        val = pts[-1].value
        # Use explicit None checks so legitimate 0.0 values are preserved.
        dv = getattr(val, "double_value", None)
        iv = getattr(val, "int64_value", None)
        numeric = dv if dv is not None else iv
        if numeric is None and getattr(val, "distribution_value", None) is not None:
            numeric = getattr(val.distribution_value, "mean", 0.0)
        if numeric is None:
            numeric = 0.0

        labels = {}
        labels.update(getattr(time_series.resource, "labels", {}) or {})
        labels.update(getattr(time_series.metric, "labels", {}) or {})
        key = next((labels.get(candidate) for candidate in key_candidates if labels.get(candidate)), None)
        if not key:
            key = next(iter(labels.values()), "unknown")
        return str(key), float(numeric)
    except Exception:
        return None


class GCPMonitoringDataSource(DataSource):
    """Polls GCP Cloud Monitoring for Compute Engine, Cloud SQL, and LB metrics."""

    def __init__(self) -> None:
        self._connected = False
        self._client = None
        self._project_id = ""
        self._zone = ""
        self._poll_interval = 30

    @property
    def provider_name(self) -> str:
        return "gcp"

    async def connect(self) -> None:
        from app.services.settings_service import settings as _s
        self._project_id = _s.gcp_project_id
        self._zone = _s.gcp_zone or ""
        self._poll_interval = _s.gcp_poll_interval_seconds or 30

        try:
            from google.cloud import monitoring_v3
            from google.oauth2 import service_account

            sa_json = _s.gcp_service_account_json
            if not sa_json:
                raise ValueError("gcp_service_account_json is empty")

            sa_info = json.loads(sa_json)
            credentials = service_account.Credentials.from_service_account_info(
                sa_info,
                scopes=["https://www.googleapis.com/auth/monitoring.read"],
            )
            self._client = monitoring_v3.MetricServiceClient(credentials=credentials)
            now = datetime.now(timezone.utc)
            interval = monitoring_v3.TimeInterval(
                end_time={"seconds": int(now.timestamp())},
                start_time={"seconds": int((now - timedelta(minutes=2)).timestamp())},
            )
            list(self._client.list_time_series(request={
                "name": f"projects/{self._project_id}",
                "filter": 'metric.type="compute.googleapis.com/instance/cpu/utilization"',
                "interval": interval,
                "view": monitoring_v3.ListTimeSeriesRequest.TimeSeriesView.HEADERS,
            }))
            self._connected = True
            _s.update(gcp_status="connected", gcp_error=None)
            logger.info("GCP Monitoring connected (project=%s)", self._project_id)
        except Exception as exc:
            from app.services.settings_service import settings as _s2
            _s2.update(gcp_status="error", gcp_error=str(exc)[:500])
            raise ConnectionError(f"GCP Monitoring connection failed: {exc}") from exc

    async def disconnect(self) -> None:
        self._connected = False
        self._client = None

    def _query_metric(self, metric_type: str, minutes: int = 5, align_rate: bool = False) -> dict[str, float]:
        return self._query_metric_map(
            metric_type,
            key_candidates=("instance_id", "instance_name"),
            minutes=minutes,
            align_rate=align_rate,
            zone_scoped=True,
        )

    def _query_metric_map(
        self,
        metric_type: str,
        *,
        key_candidates: tuple[str, ...],
        minutes: int = 5,
        align_rate: bool = False,
        extra_filter: str = "",
        zone_scoped: bool = False,
    ) -> dict[str, float]:
        from google.cloud import monitoring_v3

        now = datetime.now(timezone.utc)
        interval = monitoring_v3.TimeInterval(
            end_time={"seconds": int(now.timestamp())},
            start_time={"seconds": int((now - timedelta(minutes=minutes)).timestamp())},
        )
        zone_filter = f' AND resource.labels.zone="{self._zone}"' if zone_scoped and self._zone else ""
        request: dict = {
            "name": f"projects/{self._project_id}",
            "filter": f'metric.type="{metric_type}"{zone_filter}{extra_filter}',
            "interval": interval,
            "view": monitoring_v3.ListTimeSeriesRequest.TimeSeriesView.FULL,
        }
        if align_rate:
            request["aggregation"] = {
                "alignment_period": {"seconds": 60},
                "per_series_aligner": monitoring_v3.Aggregation.Aligner.ALIGN_RATE,
            }
        results: dict[str, float] = {}
        try:
            for ts in self._client.list_time_series(request=request):
                extracted = _extract_value(ts, key_candidates=key_candidates)
                if extracted:
                    key, value = extracted
                    results[key] = value
        except Exception as exc:
            logger.debug("GCP metric query failed %s: %s", metric_type, exc)
        return results

    def _compute_events(self) -> list[MetricEvent]:
        cpu_map = self._query_metric("compute.googleapis.com/instance/cpu/utilization")
        ram_used_map = self._query_metric("compute.googleapis.com/instance/memory/balloon/ram_used")
        ram_size_map = self._query_metric("compute.googleapis.com/instance/memory/balloon/ram_size")
        net_in_map = self._query_metric("compute.googleapis.com/instance/network/received_bytes_count", align_rate=True)
        net_out_map = self._query_metric("compute.googleapis.com/instance/network/sent_bytes_count", align_rate=True)
        disk_map = self._query_metric("compute.googleapis.com/instance/disk/read_bytes_count", align_rate=True)

        instance_ids = set(cpu_map) | set(ram_used_map) | set(net_in_map) | set(net_out_map)
        events = []
        for inst_id in instance_ids:
            cpu_pct = cpu_map.get(inst_id, 0.0) * 100.0
            ram_used = ram_used_map.get(inst_id, 0.0)
            ram_size = ram_size_map.get(inst_id, 4 * 1024 ** 3)
            mem_pct = (ram_used / max(ram_size, 1)) * 100.0 if ram_used else 0.0
            net_in_bps = net_in_map.get(inst_id, 0.0)
            net_out_bps = net_out_map.get(inst_id, 0.0)
            measured = ["cpu_percent", "network_in_mbps", "network_out_mbps"]
            if inst_id in ram_used_map:
                measured.append("memory_percent")

            events.append(MetricEvent(
                node_name=inst_id,
                node_type="server",
                provider="gcp",
                region=self._zone or self._project_id,
                ip_address="",
                cpu_percent=round(min(cpu_pct, 100.0), 2),
                memory_percent=round(min(mem_pct, 100.0), 2),
                disk_percent=0.0,
                network_in_mbps=round(net_in_bps * 8 / 1e6, 2),
                network_out_mbps=round(net_out_bps * 8 / 1e6, 2),
                request_rate=0.0,
                error_rate=0.0,
                latency_ms=0.0,
                metadata={
                    "data_source": "gcp",
                    "measured_metrics": measured,
                    "gcp": {
                        "cpu_utilization": cpu_map.get(inst_id),
                        "ram_used_bytes": ram_used,
                        "ram_size_bytes": ram_size,
                        "disk_read_bytes_per_s": disk_map.get(inst_id),
                    },
                },
            ))
        return events

    def _cloudsql_events(self) -> list[MetricEvent]:
        key_candidates = ("database_id", "instance_id", "resource_id")
        cpu_map = self._query_metric_map(
            "cloudsql.googleapis.com/database/cpu/utilization",
            key_candidates=key_candidates,
        )
        conn_map = self._query_metric_map(
            "cloudsql.googleapis.com/database/network/connections",
            key_candidates=key_candidates,
        )
        disk_used_map = self._query_metric_map(
            "cloudsql.googleapis.com/database/disk/bytes_used",
            key_candidates=key_candidates,
        )

        db_ids = set(cpu_map) | set(conn_map) | set(disk_used_map)
        events = []
        for db_id in db_ids:
            measured = ["cpu_percent", "request_rate"]
            if db_id in disk_used_map:
                measured.append("disk_percent")
            events.append(MetricEvent(
                node_name=db_id,
                node_type="database",
                provider="gcp",
                region=self._zone or self._project_id,
                ip_address="",
                cpu_percent=round(min(cpu_map.get(db_id, 0.0) * 100.0, 100.0), 2),
                memory_percent=0.0,
                disk_percent=round(min(disk_used_map.get(db_id, 0.0) / (100 * 1024 ** 3) * 100.0, 100.0), 2) if db_id in disk_used_map else 0.0,
                network_in_mbps=0.0,
                network_out_mbps=0.0,
                request_rate=round(conn_map.get(db_id, 0.0), 2),
                error_rate=0.0,
                latency_ms=0.0,
                metadata={
                    "data_source": "gcp",
                    "measured_metrics": measured,
                    "gcp": {
                        "database_connections": conn_map.get(db_id),
                        "disk_bytes_used": disk_used_map.get(db_id),
                    },
                },
            ))
        return events

    def _lb_events(self) -> list[MetricEvent]:
        key_candidates = ("url_map_name", "forwarding_rule_name", "target_proxy_name")
        total_req_map = self._query_metric_map(
            "loadbalancing.googleapis.com/https/request_count",
            key_candidates=key_candidates,
        )
        backend_req_map = self._query_metric_map(
            "loadbalancing.googleapis.com/https/backend_request_count",
            key_candidates=key_candidates,
        )
        backend_5xx_map = self._query_metric_map(
            "loadbalancing.googleapis.com/https/backend_request_count",
            key_candidates=key_candidates,
            extra_filter=' AND metric.labels.response_code_class="500"',
        )
        latency_map = self._query_metric_map(
            "loadbalancing.googleapis.com/https/backend_latencies",
            key_candidates=key_candidates,
        )

        lb_ids = set(total_req_map) | set(backend_req_map) | set(backend_5xx_map) | set(latency_map)
        events = []
        for lb_id in lb_ids:
            req = backend_req_map.get(lb_id, total_req_map.get(lb_id, 0.0))
            err_5xx = backend_5xx_map.get(lb_id, 0.0)
            err_rate = (err_5xx / max(req, 1.0)) * 100.0 if req > 0 else 0.0
            events.append(MetricEvent(
                node_name=lb_id,
                node_type="load_balancer",
                provider="gcp",
                region=self._zone or self._project_id,
                ip_address="",
                cpu_percent=0.0,
                memory_percent=0.0,
                disk_percent=0.0,
                network_in_mbps=0.0,
                network_out_mbps=0.0,
                request_rate=round(req, 2),
                error_rate=round(err_rate, 2),
                latency_ms=round(latency_map.get(lb_id, 0.0), 2),
                metadata={
                    "data_source": "gcp",
                    "measured_metrics": ["request_rate", "error_rate", "latency_ms"],
                    "gcp": {
                        "frontend_request_count": total_req_map.get(lb_id),
                        "backend_request_count": backend_req_map.get(lb_id),
                        "backend_5xx_count": err_5xx,
                    },
                },
            ))
        return events

    def _generate_batch(self) -> list[MetricEvent]:
        events = []
        events.extend(self._compute_events())
        events.extend(self._cloudsql_events())
        events.extend(self._lb_events())
        return events

    async def _with_retry(self, fn) -> list[MetricEvent]:
        last_exc: Exception = RuntimeError("no attempts made")
        for delay in _RETRY_DELAYS:
            try:
                return await asyncio.to_thread(fn)
            except Exception as exc:
                exc_str = str(exc).lower()
                if any(k in exc_str for k in ("permission denied", "unauthenticated", "invalid_argument", "credentials")):
                    raise
                last_exc = exc
                await asyncio.sleep(delay)
        raise last_exc

    async def get_current_snapshot(self) -> list[MetricEvent]:
        return await self._with_retry(self._generate_batch)

    async def stream_metrics(self) -> AsyncIterator[list[MetricEvent]]:
        from app.services.settings_service import settings as _s
        consecutive_failures = 0
        while self._connected:
            try:
                batch = await self._with_retry(self._generate_batch)
                consecutive_failures = 0
                _s.update(gcp_status="connected", gcp_error=None)
                yield batch
            except Exception as exc:
                consecutive_failures += 1
                logger.warning("GCP Monitoring poll failure %d/3: %s", consecutive_failures, exc)
                if consecutive_failures >= 3:
                    _s.update(gcp_status="error", gcp_error=str(exc)[:500])
                    self._connected = False
                    return
            await asyncio.sleep(_s.gcp_poll_interval_seconds or 30)

    def test_connection(self) -> dict:
        from app.services.settings_service import settings as _s
        try:
            from google.cloud import monitoring_v3
            from google.oauth2 import service_account

            sa_info = json.loads(_s.gcp_service_account_json)
            creds = service_account.Credentials.from_service_account_info(
                sa_info,
                scopes=["https://www.googleapis.com/auth/monitoring.read"],
            )
            client = monitoring_v3.MetricServiceClient(credentials=creds)
            now = datetime.now(timezone.utc)
            interval = monitoring_v3.TimeInterval(
                end_time={"seconds": int(now.timestamp())},
                start_time={"seconds": int((now - timedelta(minutes=2)).timestamp())},
            )
            list(client.list_time_series(request={
                "name": f"projects/{_s.gcp_project_id}",
                "filter": 'metric.type="compute.googleapis.com/instance/cpu/utilization"',
                "interval": interval,
                "view": monitoring_v3.ListTimeSeriesRequest.TimeSeriesView.HEADERS,
            }))
            nodes_found = sum(1 for _ in list(client.list_time_series(request={
                "name": f"projects/{_s.gcp_project_id}",
                "filter": 'metric.type="compute.googleapis.com/instance/cpu/utilization"',
                "interval": interval,
                "view": monitoring_v3.ListTimeSeriesRequest.TimeSeriesView.HEADERS,
            })))
            return {
                "ok": True,
                "message": f"Connected to GCP project {_s.gcp_project_id}",
                "nodes_found": nodes_found,
            }
        except Exception as exc:
            return {"ok": False, "message": str(exc)[:300], "nodes_found": 0}
