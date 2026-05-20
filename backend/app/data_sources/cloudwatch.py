from __future__ import annotations
"""
AWS CloudWatch data source.

Polls EC2, RDS, and ELB metrics via boto3 and maps them to the canonical
MetricEvent shape. Provider-native datapoints are carried in metadata["cloudwatch"].
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator

from app.data_sources.base import DataSource, LogEvent, MetricEvent

logger = logging.getLogger("itops.cloudwatch")


def _detect_log_level(message: str) -> str:
    """Heuristic level detection from a raw syslog line."""
    upper = message.upper()
    if "CRITICAL" in upper or "EMERG" in upper or "FATAL" in upper or "PANIC" in upper:
        return "CRITICAL"
    if "ERROR" in upper or " ERR " in upper or "FAILED" in upper or "FAILURE" in upper:
        return "ERROR"
    if "WARN" in upper:
        return "WARN"
    return "INFO"


def _source_from_log_group(log_group: str) -> str:
    """Turn '/itops/ec2/syslog' into 'syslog' for the source column."""
    return log_group.rsplit("/", 1)[-1] or log_group

_RETRY_DELAYS = (1.0, 2.0, 4.0)

_PERMANENT_ERROR_CODES = frozenset({
    "AuthFailure", "InvalidClientTokenId", "AccessDenied",
    "InvalidUserID.Malformed", "SignatureDoesNotMatch",
})


def _safe_last(datapoints: list[dict], stat: str = "Average") -> float | None:
    if not datapoints:
        return None
    return sorted(datapoints, key=lambda x: x["Timestamp"])[-1].get(stat)


class CloudWatchDataSource(DataSource):
    """Polls AWS CloudWatch for EC2, RDS, and ELB metrics."""

    def __init__(self) -> None:
        self._connected = False
        self._client = None
        self._logs_client = None
        self._region = "us-east-1"
        self._instance_ids: list[str] = []
        self._poll_interval: int = 30
        self._last_log_fetch_ms: dict[str, int] = {}

    @property
    def provider_name(self) -> str:
        return "aws"

    async def connect(self) -> None:
        from app.services.settings_service import settings as _s
        self._region = _s.cloudwatch_region or "us-east-1"
        self._instance_ids = [i.strip() for i in (_s.cloudwatch_instance_ids or []) if i.strip()]
        self._poll_interval = _s.cloudwatch_poll_interval_seconds or 30

        try:
            import boto3
            self._client = boto3.client(
                "cloudwatch",
                aws_access_key_id=_s.cloudwatch_access_key_id,
                aws_secret_access_key=_s.cloudwatch_secret_access_key,
                region_name=self._region,
            )
            self._logs_client = boto3.client(
                "logs",
                aws_access_key_id=_s.cloudwatch_access_key_id,
                aws_secret_access_key=_s.cloudwatch_secret_access_key,
                region_name=self._region,
            )
            # Validate credentials with a lightweight call
            self._client.list_metrics(Namespace="AWS/EC2", RecentlyActive="PT3H")
            self._connected = True
            _s.update(cloudwatch_status="connected", cloudwatch_error=None)
            logger.info("CloudWatch connected (region=%s, instances=%d)", self._region, len(self._instance_ids))
        except Exception as exc:
            from app.services.settings_service import settings as _s2
            _s2.update(cloudwatch_status="error", cloudwatch_error=str(exc)[:500])
            raise ConnectionError(f"CloudWatch connection failed: {exc}") from exc

    async def disconnect(self) -> None:
        self._connected = False
        self._client = None
        self._logs_client = None

    def _get_stat(self, namespace: str, metric: str, dims: list[dict], period: int = 60) -> float | None:
        end = datetime.now(timezone.utc)
        start = end - timedelta(seconds=period * 3)
        try:
            resp = self._client.get_metric_statistics(
                Namespace=namespace,
                MetricName=metric,
                Dimensions=dims,
                StartTime=start,
                EndTime=end,
                Period=period,
                Statistics=["Average"],
            )
            return _safe_last(resp.get("Datapoints", []))
        except Exception as exc:
            logger.debug("CloudWatch stat failed %s/%s: %s", namespace, metric, exc)
            return None

    def _ec2_event(self, instance_id: str) -> MetricEvent | None:
        dims = [{"Name": "InstanceId", "Value": instance_id}]
        cpu = self._get_stat("AWS/EC2", "CPUUtilization", dims)
        if cpu is None:
            return None
        net_in_b = self._get_stat("AWS/EC2", "NetworkIn", dims) or 0.0
        net_out_b = self._get_stat("AWS/EC2", "NetworkOut", dims) or 0.0
        status_fail = self._get_stat("AWS/EC2", "StatusCheckFailed", dims) or 0.0
        net_in_mbps = net_in_b * 8 / 1e6 / 60
        net_out_mbps = net_out_b * 8 / 1e6 / 60
        return MetricEvent(
            node_name=instance_id,
            node_type="server",
            provider="aws",
            region=self._region,
            ip_address="",
            cpu_percent=round(cpu, 2),
            memory_percent=0.0,
            disk_percent=0.0,
            network_in_mbps=round(net_in_mbps, 2),
            network_out_mbps=round(net_out_mbps, 2),
            request_rate=0.0,
            error_rate=100.0 if status_fail >= 1.0 else 0.0,
            latency_ms=0.0,
            metadata={"data_source": "aws", "cloudwatch": {
                "NetworkIn_bytes": net_in_b,
                "NetworkOut_bytes": net_out_b,
                "StatusCheckFailed": status_fail,
            }},
        )

    def _rds_event(self, db_id: str) -> MetricEvent | None:
        dims = [{"Name": "DBInstanceIdentifier", "Value": db_id}]
        cpu = self._get_stat("AWS/RDS", "CPUUtilization", dims)
        if cpu is None:
            return None
        db_conns = self._get_stat("AWS/RDS", "DatabaseConnections", dims) or 0.0
        free_storage = self._get_stat("AWS/RDS", "FreeStorageSpace", dims)
        read_lat = self._get_stat("AWS/RDS", "ReadLatency", dims) or 0.0
        disk_pct = 0.0
        if free_storage is not None:
            assumed_total = 100 * 1024 ** 3  # assume 100 GB if AllocatedStorage unknown
            disk_pct = max(0.0, min(100.0, (1.0 - free_storage / assumed_total) * 100.0))
        return MetricEvent(
            node_name=db_id,
            node_type="database",
            provider="aws",
            region=self._region,
            ip_address="",
            cpu_percent=round(cpu, 2),
            memory_percent=0.0,
            disk_percent=round(disk_pct, 2),
            network_in_mbps=0.0,
            network_out_mbps=0.0,
            request_rate=round(db_conns, 2),
            error_rate=0.0,
            latency_ms=round(read_lat * 1000, 2),
            metadata={"data_source": "aws", "cloudwatch": {
                "DatabaseConnections": db_conns,
                "FreeStorageSpace": free_storage,
                "ReadLatency_s": read_lat,
            }},
        )

    def _elb_event(self, lb_name: str) -> MetricEvent | None:
        dims = [{"Name": "LoadBalancer", "Value": lb_name}]
        req_count = self._get_stat("AWS/ApplicationELB", "RequestCount", dims) or 0.0
        resp_time = self._get_stat("AWS/ApplicationELB", "TargetResponseTime", dims)
        err_5xx = self._get_stat("AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", dims) or 0.0
        # Only return None if the LB truly doesn't exist (no data at all for any metric).
        # Zero traffic is valid — a standby LB should still be visible in monitoring.
        error_rate = (err_5xx / max(req_count, 1)) * 100.0 if req_count > 0 else 0.0
        return MetricEvent(
            node_name=lb_name,
            node_type="load_balancer",
            provider="aws",
            region=self._region,
            ip_address="",
            cpu_percent=0.0,
            memory_percent=0.0,
            disk_percent=0.0,
            network_in_mbps=0.0,
            network_out_mbps=0.0,
            request_rate=round(req_count, 2),
            error_rate=round(error_rate, 2),
            latency_ms=round((resp_time or 0.0) * 1000, 2),
            metadata={"data_source": "aws", "cloudwatch": {
                "RequestCount": req_count,
                "TargetResponseTime_s": resp_time,
                "HTTPCode_Target_5XX_Count": err_5xx,
            }},
        )

    def _event_for_resource(self, resource_id: str) -> MetricEvent | None:
        """Try EC2 → RDS → ELB in order, return first match."""
        event = self._ec2_event(resource_id)
        if event:
            return event
        event = self._rds_event(resource_id)
        if event:
            return event
        return self._elb_event(resource_id)

    def _generate_batch(self) -> list[MetricEvent]:
        events = []
        for rid in self._instance_ids:
            try:
                event = self._event_for_resource(rid)
                if event:
                    events.append(event)
            except Exception as exc:
                logger.warning("CloudWatch: failed to fetch %s: %s", rid, exc)
        return events

    async def _with_retry(self, fn) -> list[MetricEvent]:
        last_exc: Exception = RuntimeError("no attempts made")
        for delay in _RETRY_DELAYS:
            try:
                return await asyncio.to_thread(fn)
            except Exception as exc:
                # Don't retry permanent auth/credential errors.
                try:
                    import botocore.exceptions
                    if isinstance(exc, botocore.exceptions.ClientError):
                        code = exc.response.get("Error", {}).get("Code", "")
                        if code in _PERMANENT_ERROR_CODES:
                            raise
                except ImportError:
                    pass
                last_exc = exc
                await asyncio.sleep(delay)
        raise last_exc

    def fetch_logs_for_instance(self, instance_id: str, max_events: int = 100) -> list[LogEvent]:
        """
        Pull new log events for one instance from every configured log group.

        The CloudWatch agent writes one log stream per instance (log_stream_name
        = "{instance_id}"), so we filter by that stream. A per-instance high-water
        mark (_last_log_fetch_ms) makes each poll incremental — only events newer
        than the last one we saw are returned. First call seeds at "now - 5 min"
        so we don't replay the entire history on startup.
        """
        from app.services.settings_service import settings as _s

        if self._logs_client is None:
            return []
        log_groups = [g.strip() for g in (_s.cloudwatch_log_groups or []) if g.strip()]
        if not log_groups:
            return []

        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        start_ms = self._last_log_fetch_ms.get(
            instance_id, now_ms - 5 * 60 * 1000
        )

        events: list[LogEvent] = []
        max_seen_ms = start_ms
        for log_group in log_groups:
            source = _source_from_log_group(log_group)
            try:
                resp = self._logs_client.filter_log_events(
                    logGroupName=log_group,
                    logStreamNames=[instance_id],
                    startTime=start_ms + 1,
                    limit=max_events,
                )
            except Exception as exc:
                # Missing log group / stream is normal until the agent ships
                # its first batch — debug-level only, never fatal.
                logger.debug(
                    "CloudWatch Logs fetch failed (%s / %s): %s",
                    log_group, instance_id, exc,
                )
                continue

            for evt in resp.get("events", []):
                ts_ms = int(evt.get("timestamp", now_ms))
                msg = (evt.get("message") or "").rstrip("\n")[:2000]
                if not msg:
                    continue
                events.append(LogEvent(
                    node_name=instance_id,
                    timestamp=datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc),
                    level=_detect_log_level(msg),
                    source=source,
                    message=msg,
                ))
                if ts_ms > max_seen_ms:
                    max_seen_ms = ts_ms

        self._last_log_fetch_ms[instance_id] = max_seen_ms
        events.sort(key=lambda e: e.timestamp)
        return events

    async def get_current_snapshot(self) -> list[MetricEvent]:
        return await self._with_retry(self._generate_batch)

    async def stream_metrics(self) -> AsyncIterator[list[MetricEvent]]:
        from app.services.settings_service import settings as _s
        consecutive_failures = 0
        while self._connected:
            try:
                batch = await self._with_retry(self._generate_batch)
                consecutive_failures = 0
                _s.update(cloudwatch_status="connected", cloudwatch_error=None)
                yield batch
            except Exception as exc:
                consecutive_failures += 1
                logger.warning("CloudWatch poll failure %d/3: %s", consecutive_failures, exc)
                if consecutive_failures >= 3:
                    _s.update(cloudwatch_status="error", cloudwatch_error=str(exc)[:500])
                    self._connected = False
                    return
            await asyncio.sleep(_s.cloudwatch_poll_interval_seconds or 30)

    def test_connection(self) -> dict:
        from app.services.settings_service import settings as _s
        try:
            import boto3
            client = boto3.client(
                "cloudwatch",
                aws_access_key_id=_s.cloudwatch_access_key_id,
                aws_secret_access_key=_s.cloudwatch_secret_access_key,
                region_name=_s.cloudwatch_region or "us-east-1",
            )
            client.list_metrics(Namespace="AWS/EC2", RecentlyActive="PT3H")
            ids = [i.strip() for i in (_s.cloudwatch_instance_ids or []) if i.strip()]
            return {
                "ok": True,
                "message": f"Connected to AWS CloudWatch ({_s.cloudwatch_region})",
                "nodes_found": len(ids),
            }
        except Exception as exc:
            return {"ok": False, "message": str(exc)[:300], "nodes_found": 0}
