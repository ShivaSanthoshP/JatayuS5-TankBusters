from contextlib import contextmanager
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.services.settings_service import settings

client = TestClient(app)


@contextmanager
def _restore_settings():
    original = settings.snapshot(include_secrets=True)
    try:
        yield
    finally:
        settings.update(
            azure_tenant_id=original["azure_tenant_id"],
            azure_client_id=original["azure_client_id"],
            azure_client_secret=original["azure_client_secret"],
            azure_subscription_id=original["azure_subscription_id"],
            azure_resource_group=original["azure_resource_group"],
            azure_status=original["azure_status"],
            azure_error=original["azure_error"],
            gcp_project_id=original["gcp_project_id"],
            gcp_service_account_json=original["gcp_service_account_json"],
            gcp_zone=original["gcp_zone"],
            gcp_status=original["gcp_status"],
            gcp_error=original["gcp_error"],
        )


def test_list_datasources_surfaces_live_azure_and_gcp_settings():
    with _restore_settings():
        settings.update(
            azure_client_id="azure-client-id",
            azure_subscription_id="azure-sub-1234",
            azure_resource_group="rg-prod",
            azure_status="connected",
            azure_error=None,
            gcp_project_id="gcp-prod-project",
            gcp_service_account_json='{"type":"service_account"}',
            gcp_zone="asia-south1-a",
            gcp_status="connected",
            gcp_error=None,
        )

        body = client.get("/api/datasources/").json()
        providers = {source["provider"]: source for source in body["sources"]}

        assert providers["azure"]["status"] == "connected"
        assert providers["azure"]["config"]["client_secret"] == ""
        assert providers["gcp"]["status"] == "connected"
        assert providers["gcp"]["config"]["credentials_json"] == "***"


def test_configure_datasource_azure_connects_live_adapter():
    async def _noop_connect(self):
        return None

    with _restore_settings(), \
        patch("app.data_sources.azure_monitor.AzureMonitorDataSource.connect", _noop_connect), \
        patch("app.api.routes.settings._spawn_cloud_task"), \
        patch("app.data_sources.base.registry.register"):
        resp = client.post("/api/datasources/configure", json={
            "provider": "azure",
            "enabled": True,
            "config": {
                "tenant_id": "tenant-x",
                "client_id": "client-x",
                "client_secret": "secret-x",
                "subscription_id": "sub-x",
                "resource_group": "rg-x",
            },
        })
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["source"]["status"] == "connected"
        snap = settings.snapshot(include_secrets=True)
        assert snap["azure_subscription_id"] == "sub-x"
        assert snap["azure_client_secret"] == "secret-x"


def test_configure_datasource_gcp_connects_live_adapter():
    async def _noop_connect(self):
        return None

    with _restore_settings(), \
        patch("app.data_sources.gcp_monitoring.GCPMonitoringDataSource.connect", _noop_connect), \
        patch("app.api.routes.settings._spawn_cloud_task"), \
        patch("app.data_sources.base.registry.register"):
        resp = client.post("/api/datasources/configure", json={
            "provider": "gcp",
            "enabled": True,
            "config": {
                "project_id": "proj-x",
                "credentials_json": '{"type":"service_account"}',
                "zone": "us-central1-a",
            },
        })
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["source"]["status"] == "connected"
        snap = settings.snapshot(include_secrets=True)
        assert snap["gcp_project_id"] == "proj-x"
        assert snap["gcp_service_account_json"] == '{"type":"service_account"}'


def test_configure_datasource_disable_azure_disconnects_but_keeps_config():
    with _restore_settings(), patch("app.data_sources.base.registry._sources", {"azure": object()}):
        settings.update(
            azure_tenant_id="tenant-x",
            azure_client_id="client-x",
            azure_client_secret="secret-x",
            azure_subscription_id="sub-x",
            azure_resource_group="rg-x",
            azure_status="connected",
            azure_error="old error",
        )

        resp = client.post("/api/datasources/configure", json={
            "provider": "azure",
            "enabled": False,
            "config": {
                "tenant_id": "tenant-x",
                "client_id": "client-x",
                "subscription_id": "sub-x",
                "resource_group": "rg-x",
            },
        })

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["source"]["status"] == "disconnected"
        snap = settings.snapshot(include_secrets=True)
        assert snap["azure_status"] == "disconnected"
        assert snap["azure_error"] is None
        assert snap["azure_client_secret"] == "secret-x"
        assert "azure" not in __import__("app.data_sources.base", fromlist=["registry"]).registry._sources


def test_remove_datasource_clears_aws_runtime_settings():
    with _restore_settings(), patch("app.data_sources.base.registry._sources", {"aws": object()}):
        settings.update(
            cloudwatch_access_key_id="AKIATEST1234",
            cloudwatch_secret_access_key="secret-x",
            cloudwatch_region="ap-south-1",
            cloudwatch_instance_ids=["i-123", "i-456"],
            cloudwatch_log_groups=["/itops/ec2/syslog"],
            cloudwatch_status="connected",
            cloudwatch_error="old error",
        )

        resp = client.delete("/api/datasources/aws")

        assert resp.status_code == 200, resp.text
        snap = settings.snapshot(include_secrets=True)
        assert snap["cloudwatch_access_key_id"] == ""
        assert snap["cloudwatch_secret_access_key"] == ""
        assert snap["cloudwatch_region"] == ""
        assert snap["cloudwatch_instance_ids"] == []
        assert snap["cloudwatch_log_groups"] == []
        assert snap["cloudwatch_status"] == "disconnected"
        assert snap["cloudwatch_error"] is None
        assert "aws" not in __import__("app.data_sources.base", fromlist=["registry"]).registry._sources
