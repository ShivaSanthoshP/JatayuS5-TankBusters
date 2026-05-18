from __future__ import annotations
"""
GCP Cloud Monitoring data source.

Queries Compute Engine CPU, memory, disk, and network metrics via the
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


def _extract_value(time_series) -> tuple[str, float] | None:
    try:
        pts = list(time_series.points)
        if not pts:
            return None
        val = pts[-1].value
        numeric = (
            getattr(val, "double_value", None)
            or getattr(val, "int64_value", None)
            or 0.0
        )
        labels = time_series.resource.labels
        label = labels.get("instance_id") or labels.get("instance_name", "unknown")
        return label, float(numeric)
    except Exception:
        return None


class GCPMonitoringDataSource(DataSource):
    """Polls GCP Cloud Monitoring for Compute Engine instance metrics."""

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
            # Validate with a lightweight list call
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

    def _query_metric(self, metric_type: str, minutes: int = 5) -> dict[str, float]:
        from google.cloud import monitoring_v3
        now = datetime.now(timezone.utc)
        interval = monitoring_v3.TimeInterval(
            end_time={"seconds": int(now.timestamp())},
            start_time={"seconds": int((now - timedelta(minutes=minutes)).timestamp())},
        )
        zone_filter = f' AND resource.labels.zone="{self._zone}"' if self._zone else ""
        results: dict[str, float] = {}
        try:
            series = self._client.list_time_series(request={
                "name": f"projects/{self._project_id}",
                "filter": f'metric.type="{metric_type}"{zone_filter}',
                "interval": interval,
                "view": monitoring_v3.ListTimeSeriesRequest.TimeSeriesView.FULL,
            })
            for ts in series:
                extracted = _extract_value(ts)
                if extracted:
                    label, value = extracted
                    results[label] = value
        except Exception as exc:
            logger.debug("GCP metric query failed %s: %s", metric_type, exc)
        return results

    def _generate_batch(self) -> list[MetricEvent]:
        cpu_map = self._query_metric("compute.googleapis.com/instance/cpu/utilization")
        ram_used_map = self._query_metric("compute.googleapis.com/instance/memory/balloon/ram_used")
        ram_size_map = self._query_metric("compute.googleapis.com/instance/memory/balloon/ram_size")
        net_in_map = self._query_metric("compute.googleapis.com/instance/network/received_bytes_count")
        net_out_map = self._query_metric("compute.googleapis.com/instance/network/sent_bytes_count")
        disk_map = self._query_metric("compute.googleapis.com/instance/disk/read_bytes_count")

        instance_ids = set(cpu_map) | set(ram_used_map) | set(net_in_map)
        events = []
        for inst_id in instance_ids:
            cpu_pct = cpu_map.get(inst_id, 0.0) * 100.0
            ram_used = ram_used_map.get(inst_id, 0.0)
            ram_size = ram_size_map.get(inst_id, 4 * 1024 ** 3)
            mem_pct = (ram_used / max(ram_size, 1)) * 100.0 if ram_used else 0.0
            net_in_b = net_in_map.get(inst_id, 0.0)
            net_out_b = net_out_map.get(inst_id, 0.0)

            events.append(MetricEvent(
                node_name=inst_id,
                node_type="server",
                provider="gcp",
                region=self._zone or self._project_id,
                ip_address="",
                cpu_percent=round(min(cpu_pct, 100.0), 2),
                memory_percent=round(min(mem_pct, 100.0), 2),
                disk_percent=0.0,
                network_in_mbps=round(net_in_b * 8 / 1e6 / 60, 2),
                network_out_mbps=round(net_out_b * 8 / 1e6 / 60, 2),
                request_rate=0.0,
                error_rate=0.0,
                latency_ms=0.0,
                metadata={"gcp": {
                    "cpu_utilization": cpu_map.get(inst_id),
                    "ram_used_bytes": ram_used,
                    "ram_size_bytes": ram_size,
                    "disk_read_bytes": disk_map.get(inst_id),
                }},
            ))
        return events

    async def _with_retry(self, fn) -> list[MetricEvent]:
        last_exc: Exception = RuntimeError("no attempts made")
        for delay in _RETRY_DELAYS:
            try:
                return await asyncio.to_thread(fn)
            except Exception as exc:
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
            return {
                "ok": True,
                "message": f"Connected to GCP project {_s.gcp_project_id}",
                "nodes_found": 0,
            }
        except Exception as exc:
            return {"ok": False, "message": str(exc)[:300], "nodes_found": 0}
