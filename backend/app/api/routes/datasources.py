from __future__ import annotations
"""Data source configuration & metric ingestion API routes."""

import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.services.infra_service import InfraService
from app.data_sources.base import MetricEvent
from app.config import utc_now

logger = logging.getLogger("itops.api.datasources")

router = APIRouter(prefix="/datasources", tags=["Data Sources"])


class DataSourceConfig(BaseModel):
    provider: str  # simulated, aws, azure, gcp, prometheus, docker, logfile, custom
    enabled: bool = True
    config: dict = {}


class MetricIngest(BaseModel):
    node_name: str
    node_type: str = "server"
    provider: str = "custom"
    region: str = "custom"
    ip_address: str = "0.0.0.0"
    cpu_percent: float = 0.0
    memory_percent: float = 0.0
    disk_percent: float = 0.0
    network_in_mbps: float = 0.0
    network_out_mbps: float = 0.0
    request_rate: float = 0.0
    error_rate: float = 0.0
    latency_ms: float = 0.0


class ConnectionTestRequest(BaseModel):
    provider: str
    config: dict = {}


# In-memory store for configured data sources
_configured_sources: list[dict] = [
    {
        "id": "sim-default",
        "provider": "simulated",
        "name": "Built-in Simulator",
        "enabled": True,
        "status": "connected",
        "config": {},
        "created_at": utc_now().isoformat(),
    }
]

# Keys that must never be echoed back to any caller. Values are replaced
# with a fixed placeholder in all GET responses and in the echo payload of
# POST /configure. Anything not listed here (regions, URLs, project IDs)
# is returned as-is because the UI needs it for display.
_SENSITIVE_CONFIG_KEYS: dict[str, set[str]] = {
    "aws": {"aws_access_key_id", "aws_secret_access_key"},
    "azure": {"client_secret"},
    "gcp": {"credentials_json"},
    "prometheus": {"auth_token"},
}
_REDACTED = "***"


def _redact_config(provider: str, config: dict | None) -> dict:
    """Return a copy of the config with sensitive values replaced."""
    if not config:
        return {}
    sensitive = _SENSITIVE_CONFIG_KEYS.get(provider, set())
    return {k: (_REDACTED if k in sensitive and v else v) for k, v in config.items()}


def _public_source(source: dict) -> dict:
    """Return a copy of a configured-source record safe to return over HTTP."""
    return {
        **source,
        "config": _redact_config(source.get("provider", ""), source.get("config")),
    }


def _key_tail(value: str | None) -> str:
    """Return the trailing 4 chars of a secret for identification (e.g. 'XRFP')."""
    if not value:
        return ""
    return value[-4:] if len(value) > 4 else value


def _aws_source_from_settings() -> dict | None:
    """Synthesize an AWS source record from persisted settings, if creds exist."""
    from app.services.settings_service import settings as _s
    if not _s.cloudwatch_access_key_id and _s.cloudwatch_status != "connected":
        return None
    region = _s.cloudwatch_region or ""
    instance_ids = list(_s.cloudwatch_instance_ids or [])
    log_groups = list(_s.cloudwatch_log_groups or [])
    tail = _key_tail(_s.cloudwatch_access_key_id)
    summary_bits = []
    if region:
        summary_bits.append(region)
    if tail:
        summary_bits.append(f"AKIA…{tail}")
    if instance_ids:
        summary_bits.append(f"{len(instance_ids)} instance{'s' if len(instance_ids) != 1 else ''}")
    return {
        "id": "aws-cloudwatch",
        "provider": "aws",
        "name": "AWS CloudWatch",
        "enabled": True,
        "status": _s.cloudwatch_status or "configured",
        "error": _s.cloudwatch_error,
        "summary": " · ".join(summary_bits) or "configured",
        "config": {
            "aws_access_key_id": _REDACTED if _s.cloudwatch_access_key_id else "",
            "aws_secret_access_key": _REDACTED if _s.cloudwatch_secret_access_key else "",
            "aws_access_key_tail": tail,
            "region": region,
            "instance_ids": ", ".join(instance_ids),
            "log_groups": ", ".join(log_groups),
        },
        "created_at": utc_now().isoformat(),
    }


def _azure_source_from_settings() -> dict | None:
    """Synthesize an Azure source record from persisted settings, if configured."""
    from app.services.settings_service import settings as _s
    if not _s.azure_client_id and _s.azure_status != "connected":
        return None
    rg = _s.azure_resource_group or ""
    sub = _s.azure_subscription_id or ""
    tail = _key_tail(_s.azure_client_id)
    summary_bits = []
    if rg:
        summary_bits.append(rg)
    if sub:
        summary_bits.append(f"sub...{_key_tail(sub)}")
    if tail:
        summary_bits.append(f"app...{tail}")
    return {
        "id": "azure-monitor",
        "provider": "azure",
        "name": "Azure Monitor",
        "enabled": True,
        "status": _s.azure_status or "configured",
        "error": _s.azure_error,
        "summary": " | ".join(summary_bits) or "configured",
        "config": {
            "tenant_id": _s.azure_tenant_id,
            "client_id": _s.azure_client_id,
            "client_secret": _REDACTED if _s.azure_client_secret else "",
            "subscription_id": _s.azure_subscription_id,
            "resource_group": rg,
        },
        "created_at": utc_now().isoformat(),
    }


def _gcp_source_from_settings() -> dict | None:
    """Synthesize a GCP source record from persisted settings, if configured."""
    from app.services.settings_service import settings as _s
    if not _s.gcp_project_id and _s.gcp_status != "connected":
        return None
    project = _s.gcp_project_id or ""
    zone = _s.gcp_zone or ""
    summary_bits = []
    if project:
        summary_bits.append(project)
    if zone:
        summary_bits.append(zone)
    if _s.gcp_service_account_json:
        summary_bits.append("service-account set")
    return {
        "id": "gcp-monitoring",
        "provider": "gcp",
        "name": "GCP Cloud Monitoring",
        "enabled": True,
        "status": _s.gcp_status or "configured",
        "error": _s.gcp_error,
        "summary": " | ".join(summary_bits) or "configured",
        "config": {
            "project_id": project,
            "credentials_json": _REDACTED if _s.gcp_service_account_json else "",
            "zone": zone,
        },
        "created_at": utc_now().isoformat(),
    }


def _live_sources() -> list[dict]:
    """Build the live sources list. Simulator is always on; AWS is derived
    from settings so it survives restarts and stays in sync with the live
    adapter — not just the in-memory POST-config list."""
    out: list[dict] = []
    # Simulator is always active in this build.
    out.append({
        "id": "sim-default",
        "provider": "simulated",
        "name": "Built-in Simulator",
        "enabled": True,
        "status": "connected",
        "summary": "Fleet metrics + anomaly injection",
        "config": {},
        "created_at": utc_now().isoformat(),
    })
    aws = _aws_source_from_settings()
    if aws:
        out.append(aws)
    azure = _azure_source_from_settings()
    if azure:
        out.append(azure)
    gcp = _gcp_source_from_settings()
    if gcp:
        out.append(gcp)
    # Pick up any other providers stored in the in-memory list.
    for s in _configured_sources:
        if s["provider"] in ("simulated", "aws", "azure", "gcp"):
            continue
        out.append(_public_source(s))
    return out


@router.get("/")
def list_datasources():
    """List all configured data sources."""
    return {
        "sources": _live_sources(),
        "available_providers": [
            {
                "id": "simulated",
                "name": "Built-in Simulator",
                "description": "Generates realistic simulated infrastructure metrics with anomaly injection",
                "config_fields": [],
            },
            {
                "id": "aws",
                "name": "AWS CloudWatch",
                "description": "Connect to AWS CloudWatch for EC2, RDS, ELB metrics",
                "config_fields": [
                    {"key": "aws_access_key_id", "label": "Access Key ID", "type": "password", "required": True},
                    {"key": "aws_secret_access_key", "label": "Secret Access Key", "type": "password", "required": True},
                    {"key": "region", "label": "AWS Region", "type": "select", "options": ["us-east-1", "us-west-2", "eu-west-1", "ap-south-1"], "required": True},
                    {"key": "instance_ids", "label": "Instance IDs (comma-separated)", "type": "text", "required": False},
                    {"key": "log_groups", "label": "Log Groups (comma-separated)", "type": "text", "required": False},
                ],
            },
            {
                "id": "azure",
                "name": "Azure Monitor",
                "description": "Connect to Azure Monitor for VM, SQL, App Service metrics",
                "config_fields": [
                    {"key": "tenant_id", "label": "Tenant ID", "type": "text", "required": True},
                    {"key": "client_id", "label": "Client ID", "type": "text", "required": True},
                    {"key": "client_secret", "label": "Client Secret", "type": "password", "required": True},
                    {"key": "subscription_id", "label": "Subscription ID", "type": "text", "required": True},
                    {"key": "resource_group", "label": "Resource Group", "type": "text", "required": False},
                ],
            },
            {
                "id": "gcp",
                "name": "GCP Cloud Monitoring",
                "description": "Connect to GCP Cloud Monitoring for Compute Engine, Cloud SQL metrics",
                "config_fields": [
                    {"key": "project_id", "label": "Project ID", "type": "text", "required": True},
                    {"key": "credentials_json", "label": "Service Account JSON", "type": "textarea", "required": True},
                    {"key": "zone", "label": "Zone", "type": "text", "required": False},
                ],
            },
            {
                "id": "prometheus",
                "name": "Prometheus",
                "description": "Scrape metrics from a Prometheus endpoint",
                "config_fields": [
                    {"key": "url", "label": "Prometheus URL", "type": "text", "required": True},
                    {"key": "scrape_interval", "label": "Scrape Interval (seconds)", "type": "number", "required": False},
                    {"key": "auth_token", "label": "Bearer Token", "type": "password", "required": False},
                ],
            },
            {
                "id": "docker",
                "name": "Docker",
                "description": "Monitor Docker containers via Docker daemon API",
                "config_fields": [
                    {"key": "docker_host", "label": "Docker Host", "type": "text", "required": True},
                    {"key": "tls_verify", "label": "TLS Verify", "type": "boolean", "required": False},
                    {"key": "cert_path", "label": "Certificate Path", "type": "text", "required": False},
                ],
            },
            {
                "id": "logfile",
                "name": "Log File Ingestion",
                "description": "Ingest metrics from CSV or JSON log files",
                "config_fields": [
                    {"key": "file_path", "label": "File Path", "type": "text", "required": True},
                    {"key": "format", "label": "Format", "type": "select", "options": ["csv", "json", "jsonl"], "required": True},
                    {"key": "watch", "label": "Watch for changes", "type": "boolean", "required": False},
                ],
            },
            {
                "id": "custom",
                "name": "Custom API Push",
                "description": "Push metrics via REST API (POST /api/datasources/ingest)",
                "config_fields": [],
            },
        ],
    }


def _csv_list(val) -> list[str]:
    """Normalize a comma-separated string (or list) into a clean list."""
    if isinstance(val, list):
        return [str(x).strip() for x in val if str(x).strip()]
    return [s.strip() for s in str(val or "").split(",") if s.strip()]


async def _activate_aws(config: dict) -> tuple[str, str | None]:
    """
    Bridge the Data Sources AWS form into settings_service and actually
    connect the CloudWatch adapter. The /configure endpoint historically only
    stored config in memory, so cloud providers configured here never polled.
    Returns (status, error).
    """
    from app.services.settings_service import settings as _s

    updates: dict = {}
    ak = config.get("aws_access_key_id")
    sk = config.get("aws_secret_access_key")
    # Never overwrite a stored secret with the redaction placeholder.
    if ak and ak != _REDACTED:
        updates["cloudwatch_access_key_id"] = ak
    if sk and sk != _REDACTED:
        updates["cloudwatch_secret_access_key"] = sk
    if config.get("region"):
        updates["cloudwatch_region"] = str(config["region"]).strip()
    if "instance_ids" in config:
        updates["cloudwatch_instance_ids"] = _csv_list(config.get("instance_ids"))
    if "log_groups" in config:
        log_groups = _csv_list(config.get("log_groups"))
        if log_groups:
            updates["cloudwatch_log_groups"] = log_groups
    if config.get("poll_interval_seconds"):
        try:
            updates["cloudwatch_poll_interval_seconds"] = int(config["poll_interval_seconds"])
        except (TypeError, ValueError):
            pass
    if updates:
        _s.update(**updates)

    from app.data_sources.cloudwatch import CloudWatchDataSource
    from app.data_sources.base import registry
    from app.api.routes.settings import _spawn_cloud_task, _poll_cloud_adapter

    adapter = CloudWatchDataSource()
    try:
        await adapter.connect()
        registry.register(adapter)
        _spawn_cloud_task(_poll_cloud_adapter(adapter))
        return "connected", None
    except Exception as exc:
        msg = str(exc)[:300]
        _s.update(cloudwatch_status="error", cloudwatch_error=msg)
        return "error", msg


async def _activate_azure(config: dict) -> tuple[str, str | None]:
    """Bridge the Azure form into settings_service and connect the live adapter."""
    from app.services.settings_service import settings as _s

    updates: dict = {}
    for source_key, target_key in (
        ("tenant_id", "azure_tenant_id"),
        ("client_id", "azure_client_id"),
        ("subscription_id", "azure_subscription_id"),
        ("resource_group", "azure_resource_group"),
    ):
        val = config.get(source_key)
        if val:
            updates[target_key] = str(val).strip()
    client_secret = config.get("client_secret")
    if client_secret and client_secret != _REDACTED:
        updates["azure_client_secret"] = client_secret
    if config.get("poll_interval_seconds"):
        try:
            updates["azure_poll_interval_seconds"] = int(config["poll_interval_seconds"])
        except (TypeError, ValueError):
            pass
    if updates:
        _s.update(**updates)

    from app.data_sources.azure_monitor import AzureMonitorDataSource
    from app.data_sources.base import registry
    from app.api.routes.settings import _spawn_cloud_task, _poll_cloud_adapter

    adapter = AzureMonitorDataSource()
    try:
        await adapter.connect()
        registry.register(adapter)
        _spawn_cloud_task(_poll_cloud_adapter(adapter))
        return "connected", None
    except Exception as exc:
        msg = str(exc)[:300]
        _s.update(azure_status="error", azure_error=msg)
        return "error", msg


async def _activate_gcp(config: dict) -> tuple[str, str | None]:
    """Bridge the GCP form into settings_service and connect the live adapter."""
    from app.services.settings_service import settings as _s

    updates: dict = {}
    project = config.get("project_id")
    if project:
        updates["gcp_project_id"] = str(project).strip()
    zone = config.get("zone")
    if zone:
        updates["gcp_zone"] = str(zone).strip()
    credentials_json = config.get("credentials_json")
    if credentials_json and credentials_json != _REDACTED:
        updates["gcp_service_account_json"] = credentials_json
    if config.get("poll_interval_seconds"):
        try:
            updates["gcp_poll_interval_seconds"] = int(config["poll_interval_seconds"])
        except (TypeError, ValueError):
            pass
    if updates:
        _s.update(**updates)

    from app.data_sources.gcp_monitoring import GCPMonitoringDataSource
    from app.data_sources.base import registry
    from app.api.routes.settings import _spawn_cloud_task, _poll_cloud_adapter

    adapter = GCPMonitoringDataSource()
    try:
        await adapter.connect()
        registry.register(adapter)
        _spawn_cloud_task(_poll_cloud_adapter(adapter))
        return "connected", None
    except Exception as exc:
        msg = str(exc)[:300]
        _s.update(gcp_status="error", gcp_error=msg)
        return "error", msg


@router.post("/configure")
async def configure_datasource(body: DataSourceConfig):
    """Add or update a data source configuration.

    For cloud providers (currently AWS) this also connects the live adapter
    and starts polling — not just an in-memory record.
    """
    status = "configured"
    error: str | None = None
    if body.provider == "aws" and body.enabled:
        status, error = await _activate_aws(body.config)
    if body.provider == "azure" and body.enabled:
        status, error = await _activate_azure(body.config)
    if body.provider == "gcp" and body.enabled:
        status, error = await _activate_gcp(body.config)

    existing = next((s for s in _configured_sources if s["provider"] == body.provider), None)
    if existing:
        existing["enabled"] = body.enabled
        existing["config"] = body.config
        existing["status"] = status
        result = {"message": f"Updated {body.provider}", "source": _public_source(existing)}
    else:
        new_source = {
            "id": f"{body.provider}-{len(_configured_sources)}",
            "provider": body.provider,
            "name": body.provider.upper(),
            "enabled": body.enabled,
            "status": status,
            "config": body.config,
            "created_at": utc_now().isoformat(),
        }
        _configured_sources.append(new_source)
        result = {"message": f"Configured {body.provider}", "source": _public_source(new_source)}

    if error:
        result["warning"] = f"Saved, but adapter connection failed: {error}"
    return result


@router.post("/test")
def test_connection(body: ConnectionTestRequest):
    """Test connection to a data source."""
    import time
    if body.provider == "simulated":
        return {"success": True, "message": "Simulator is always available", "latency_ms": 1}
    if body.provider == "custom":
        return {"success": True, "message": "Custom API push is ready — use POST /api/datasources/ingest", "latency_ms": 0}

    if body.provider == "aws":
        # Use stored creds when the form sent the redaction placeholder (or nothing),
        # so the user can re-test an already-configured source without re-entering secrets.
        from app.services.settings_service import settings as _s
        cfg = dict(body.config or {})
        ak = cfg.get("aws_access_key_id")
        sk = cfg.get("aws_secret_access_key")
        if not ak or ak == _REDACTED:
            ak = _s.cloudwatch_access_key_id
        if not sk or sk == _REDACTED:
            sk = _s.cloudwatch_secret_access_key
        region = cfg.get("region") or _s.cloudwatch_region or "us-east-1"
        if not ak or not sk:
            return {"success": False, "message": "Missing AWS credentials"}
        try:
            import boto3
            t0 = time.time()
            client = boto3.client(
                "cloudwatch", aws_access_key_id=ak, aws_secret_access_key=sk, region_name=region,
            )
            client.list_metrics(Namespace="AWS/EC2", RecentlyActive="PT3H")
            return {
                "success": True,
                "message": f"CloudWatch reachable in {region}",
                "latency_ms": int((time.time() - t0) * 1000),
            }
        except Exception as exc:
            return {"success": False, "message": f"CloudWatch test failed: {str(exc)[:300]}"}

    if body.provider == "azure":
        from app.services.settings_service import settings as _s
        from app.data_sources.azure_monitor import AzureMonitorDataSource
        cfg = dict(body.config or {})
        updates = {
            "azure_tenant_id": cfg.get("tenant_id") or _s.azure_tenant_id,
            "azure_client_id": cfg.get("client_id") or _s.azure_client_id,
            "azure_subscription_id": cfg.get("subscription_id") or _s.azure_subscription_id,
            "azure_resource_group": cfg.get("resource_group") or _s.azure_resource_group,
        }
        client_secret = cfg.get("client_secret")
        updates["azure_client_secret"] = (
            client_secret if client_secret and client_secret != _REDACTED else _s.azure_client_secret
        )
        if not all([updates["azure_tenant_id"], updates["azure_client_id"], updates["azure_client_secret"], updates["azure_subscription_id"]]):
            return {"success": False, "message": "Missing Azure credentials"}
        original = _s.snapshot(include_secrets=True)
        try:
            _s.update(**updates)
            t0 = time.time()
            out = AzureMonitorDataSource().test_connection()
            return {"success": bool(out.get("ok")), "message": out.get("message", ""), "latency_ms": int((time.time() - t0) * 1000)}
        finally:
            _s.update(
                azure_tenant_id=original["azure_tenant_id"],
                azure_client_id=original["azure_client_id"],
                azure_client_secret=original["azure_client_secret"],
                azure_subscription_id=original["azure_subscription_id"],
                azure_resource_group=original["azure_resource_group"],
            )

    if body.provider == "gcp":
        from app.services.settings_service import settings as _s
        from app.data_sources.gcp_monitoring import GCPMonitoringDataSource
        cfg = dict(body.config or {})
        updates = {
            "gcp_project_id": cfg.get("project_id") or _s.gcp_project_id,
            "gcp_zone": cfg.get("zone") or _s.gcp_zone,
        }
        credentials_json = cfg.get("credentials_json")
        updates["gcp_service_account_json"] = (
            credentials_json if credentials_json and credentials_json != _REDACTED else _s.gcp_service_account_json
        )
        if not updates["gcp_project_id"] or not updates["gcp_service_account_json"]:
            return {"success": False, "message": "Missing GCP credentials"}
        original = _s.snapshot(include_secrets=True)
        try:
            _s.update(**updates)
            t0 = time.time()
            out = GCPMonitoringDataSource().test_connection()
            return {"success": bool(out.get("ok")), "message": out.get("message", ""), "latency_ms": int((time.time() - t0) * 1000)}
        finally:
            _s.update(
                gcp_project_id=original["gcp_project_id"],
                gcp_service_account_json=original["gcp_service_account_json"],
                gcp_zone=original["gcp_zone"],
            )

    if body.provider in ("prometheus", "docker", "logfile"):
        missing = [f["key"] for f in _get_required_fields(body.provider) if f["key"] not in body.config]
        if missing:
            return {"success": False, "message": f"Missing required fields: {', '.join(missing)}"}
        return {
            "success": True,
            "message": f"Connection to {body.provider} validated (simulated test)",
            "latency_ms": 150,
        }
    return {"success": False, "message": f"Unknown provider: {body.provider}"}


@router.delete("/{provider}")
def remove_datasource(provider: str):
    """Remove a configured data source."""
    global _configured_sources
    if provider == "simulated":
        raise HTTPException(400, "Cannot remove the built-in simulator")
    if provider == "aws":
        # Clear the persisted CloudWatch settings so it doesn't auto-reconnect
        # on next restart. The running adapter is dropped from the registry.
        from app.services.settings_service import settings as _s
        from app.data_sources.base import registry
        _s.update(
            cloudwatch_access_key_id="",
            cloudwatch_secret_access_key="",
            cloudwatch_status="disconnected",
            cloudwatch_error=None,
        )
        registry._sources.pop("aws", None)
    if provider == "azure":
        from app.services.settings_service import settings as _s
        from app.data_sources.base import registry
        _s.update(
            azure_tenant_id="",
            azure_client_id="",
            azure_client_secret="",
            azure_subscription_id="",
            azure_resource_group="",
            azure_status="disconnected",
            azure_error=None,
        )
        registry._sources.pop("azure", None)
    if provider == "gcp":
        from app.services.settings_service import settings as _s
        from app.data_sources.base import registry
        _s.update(
            gcp_project_id="",
            gcp_service_account_json="",
            gcp_zone="",
            gcp_status="disconnected",
            gcp_error=None,
        )
        registry._sources.pop("gcp", None)
    _configured_sources = [s for s in _configured_sources if s["provider"] != provider]
    return {"message": f"Removed {provider}"}


@router.post("/ingest")
def ingest_metrics(body: MetricIngest, db: Session = Depends(get_db)):
    """
    Push metrics for a node directly via REST API.
    Use this for custom integrations or manual testing.
    """
    infra_svc = InfraService(db)
    event = MetricEvent(
        node_name=body.node_name,
        node_type=body.node_type,
        provider=body.provider,
        region=body.region,
        ip_address=body.ip_address,
        cpu_percent=body.cpu_percent,
        memory_percent=body.memory_percent,
        disk_percent=body.disk_percent,
        network_in_mbps=body.network_in_mbps,
        network_out_mbps=body.network_out_mbps,
        request_rate=body.request_rate,
        error_rate=body.error_rate,
        latency_ms=body.latency_ms,
    )
    node = infra_svc.ensure_node_exists(event)
    snapshot = infra_svc.store_metric(node, event)
    db.commit()

    return {
        "message": "Metrics ingested",
        "node_id": node.id,
        "snapshot_id": snapshot.id,
        "node_name": body.node_name,
    }


@router.post("/ingest/batch")
def ingest_batch(metrics: list[MetricIngest], db: Session = Depends(get_db)):
    """Push a batch of metrics for multiple nodes."""
    infra_svc = InfraService(db)
    results = []
    for body in metrics:
        event = MetricEvent(
            node_name=body.node_name,
            node_type=body.node_type,
            provider=body.provider,
            region=body.region,
            ip_address=body.ip_address,
            cpu_percent=body.cpu_percent,
            memory_percent=body.memory_percent,
            disk_percent=body.disk_percent,
            network_in_mbps=body.network_in_mbps,
            network_out_mbps=body.network_out_mbps,
            request_rate=body.request_rate,
            error_rate=body.error_rate,
            latency_ms=body.latency_ms,
        )
        node = infra_svc.ensure_node_exists(event)
        infra_svc.store_metric(node, event)
        results.append({"node_name": body.node_name, "node_id": node.id})
    db.commit()
    return {"message": f"Ingested {len(results)} metrics", "results": results}


def _get_required_fields(provider: str) -> list[dict]:
    providers = {
        "aws": [{"key": "aws_access_key_id"}, {"key": "aws_secret_access_key"}, {"key": "region"}],
        "azure": [{"key": "tenant_id"}, {"key": "client_id"}, {"key": "client_secret"}, {"key": "subscription_id"}],
        "gcp": [{"key": "project_id"}, {"key": "credentials_json"}],
        "prometheus": [{"key": "url"}],
        "docker": [{"key": "docker_host"}],
        "logfile": [{"key": "file_path"}, {"key": "format"}],
    }
    return providers.get(provider, [])
