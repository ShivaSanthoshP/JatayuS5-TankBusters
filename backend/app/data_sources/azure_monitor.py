from __future__ import annotations
"""
Azure Monitor data source.

Discovers VMs and App Services in the configured resource group and polls
their metrics via azure-monitor-query. Provider-native values are carried
in metadata["azure_monitor"].
"""

import asyncio
import logging
from datetime import timedelta
from typing import AsyncIterator

from app.data_sources.base import DataSource, MetricEvent

logger = logging.getLogger("itops.azure_monitor")

_RETRY_DELAYS = (1.0, 2.0, 4.0)

_VM_METRICS = [
    "Percentage CPU",
    "Network In Total",
    "Network Out Total",
    "Disk Read Bytes",
    "Available Memory Bytes",
]
_APP_METRICS = ["CpuPercentage", "MemoryPercentage", "AverageResponseTime", "Http5xx", "Requests"]


def _last_value(metric_result) -> float | None:
    try:
        for ts in metric_result.timeseries:
            for dp in reversed(ts.data):
                if dp.average is not None:
                    return dp.average
    except Exception:
        pass
    return None


def _vm_to_event(resource_id: str, vm_name: str, region: str, results) -> MetricEvent:
    raw: dict = {}
    for m in results.metrics:
        val = _last_value(m)
        if val is not None:
            raw[m.name] = val

    cpu = raw.get("Percentage CPU", 0.0)
    net_in_b = raw.get("Network In Total", 0.0)
    net_out_b = raw.get("Network Out Total", 0.0)
    avail_mem_b = raw.get("Available Memory Bytes")
    total_mem_b = 4 * 1024 ** 3  # assume 4 GB if unknown
    if avail_mem_b is not None:
        mem_pct = max(0.0, min(100.0, (1.0 - avail_mem_b / total_mem_b) * 100.0))
    else:
        mem_pct = 0.0  # metric unavailable; do not report false 0% usage

    return MetricEvent(
        node_name=vm_name,
        node_type="server",
        provider="azure",
        region=region,
        ip_address="",
        cpu_percent=round(cpu, 2),
        memory_percent=round(mem_pct, 2),
        disk_percent=0.0,
        network_in_mbps=round(net_in_b * 8 / 1e6 / 60, 2),
        network_out_mbps=round(net_out_b * 8 / 1e6 / 60, 2),
        request_rate=0.0,
        error_rate=0.0,
        latency_ms=0.0,
        metadata={"azure_monitor": raw, "resource_id": resource_id},
    )


def _app_to_event(resource_id: str, app_name: str, region: str, results) -> MetricEvent:
    raw: dict = {}
    for m in results.metrics:
        val = _last_value(m)
        if val is not None:
            raw[m.name] = val

    cpu = raw.get("CpuPercentage", 0.0)
    mem = raw.get("MemoryPercentage", 0.0)
    avg_resp = raw.get("AverageResponseTime", 0.0)
    http5xx = raw.get("Http5xx", 0.0)
    req = raw.get("Requests", 0.0)
    err_rate = (http5xx / max(req, 1)) * 100.0 if req > 0 else 0.0

    return MetricEvent(
        node_name=app_name,
        node_type="server",
        provider="azure",
        region=region,
        ip_address="",
        cpu_percent=round(cpu, 2),
        memory_percent=round(mem, 2),
        disk_percent=0.0,
        network_in_mbps=0.0,
        network_out_mbps=0.0,
        request_rate=round(req, 2),
        error_rate=round(err_rate, 2),
        latency_ms=round(avg_resp * 1000, 2),
        metadata={"azure_monitor": raw, "resource_id": resource_id},
    )


class AzureMonitorDataSource(DataSource):
    """Polls Azure Monitor for VM and App Service metrics."""

    def __init__(self) -> None:
        self._connected = False
        self._metrics_client = None
        self._subscription_id = ""
        self._resource_group = ""
        self._poll_interval = 30
        self._resources: list[dict] = []

    @property
    def provider_name(self) -> str:
        return "azure"

    def _build_credential(self, s):
        from azure.identity import ClientSecretCredential
        return ClientSecretCredential(
            tenant_id=s.azure_tenant_id,
            client_id=s.azure_client_id,
            client_secret=s.azure_client_secret,
        )

    def _discover_resources(self, credential, subscription_id: str, resource_group: str) -> list[dict]:
        resources = []
        try:
            from azure.mgmt.compute import ComputeManagementClient
            compute = ComputeManagementClient(credential, subscription_id)
            for vm in compute.virtual_machines.list(resource_group):
                resources.append({
                    "id": vm.id,
                    "name": vm.name,
                    "type": "vm",
                    "region": vm.location or "unknown",
                })
        except Exception as exc:
            logger.warning("Azure VM discovery failed: %s", exc)

        try:
            from azure.mgmt.resource import ResourceManagementClient
            rc = ResourceManagementClient(credential, subscription_id)
            for res in rc.resources.list_by_resource_group(
                resource_group,
                filter="resourceType eq 'Microsoft.Web/sites'",
            ):
                resources.append({
                    "id": res.id,
                    "name": res.name,
                    "type": "app",
                    "region": res.location or "unknown",
                })
        except Exception as exc:
            logger.warning("Azure App Service discovery failed: %s", exc)

        return resources

    async def connect(self) -> None:
        from app.services.settings_service import settings as _s
        self._subscription_id = _s.azure_subscription_id
        self._resource_group = _s.azure_resource_group or ""
        self._poll_interval = _s.azure_poll_interval_seconds or 30

        try:
            from azure.monitor.query import MetricsQueryClient
            credential = self._build_credential(_s)
            self._metrics_client = MetricsQueryClient(credential)
            if self._resource_group:
                self._resources = await asyncio.to_thread(
                    self._discover_resources, credential, self._subscription_id, self._resource_group
                )
            self._connected = True
            _s.update(azure_status="connected", azure_error=None)
            logger.info("Azure Monitor connected (rg=%s, resources=%d)", self._resource_group, len(self._resources))
        except Exception as exc:
            from app.services.settings_service import settings as _s2
            _s2.update(azure_status="error", azure_error=str(exc)[:500])
            raise ConnectionError(f"Azure Monitor connection failed: {exc}") from exc

    async def disconnect(self) -> None:
        self._connected = False
        self._metrics_client = None

    def _query_resource(self, resource_id: str, metric_names: list[str]):
        return self._metrics_client.query_resource(
            resource_id,
            metric_names=metric_names,
            timespan=timedelta(minutes=5),
            granularity=timedelta(minutes=1),
        )

    def _generate_batch(self) -> list[MetricEvent]:
        events = []
        for res in self._resources:
            try:
                if res["type"] == "vm":
                    results = self._query_resource(res["id"], _VM_METRICS)
                    events.append(_vm_to_event(res["id"], res["name"], res["region"], results))
                elif res["type"] == "app":
                    results = self._query_resource(res["id"], _APP_METRICS)
                    events.append(_app_to_event(res["id"], res["name"], res["region"], results))
            except Exception as exc:
                logger.warning("Azure Monitor: failed to query %s: %s", res["name"], exc)
        return events

    async def _with_retry(self, fn) -> list[MetricEvent]:
        last_exc: Exception = RuntimeError("no attempts made")
        for delay in _RETRY_DELAYS:
            try:
                return await asyncio.to_thread(fn)
            except Exception as exc:
                # Don't retry permanent auth errors from Azure.
                exc_type = type(exc).__name__
                if any(t in exc_type for t in ("AuthenticationError", "ClientAuthenticationError", "HttpResponseError")):
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
                _s.update(azure_status="connected", azure_error=None)
                yield batch
            except Exception as exc:
                consecutive_failures += 1
                logger.warning("Azure Monitor poll failure %d/3: %s", consecutive_failures, exc)
                if consecutive_failures >= 3:
                    _s.update(azure_status="error", azure_error=str(exc)[:500])
                    self._connected = False
                    return
            await asyncio.sleep(_s.azure_poll_interval_seconds or 30)

    def test_connection(self) -> dict:
        from app.services.settings_service import settings as _s
        try:
            credential = self._build_credential(_s)
            from azure.mgmt.resource import ResourceManagementClient
            rc = ResourceManagementClient(credential, _s.azure_subscription_id)
            list(rc.resource_groups.list())
            return {
                "ok": True,
                "message": "Connected to Azure Monitor",
                "nodes_found": len(self._resources),
            }
        except Exception as exc:
            return {"ok": False, "message": str(exc)[:300], "nodes_found": 0}
