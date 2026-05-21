from __future__ import annotations
"""Data source tools for the SRE Copilot."""

import asyncio
import threading

from sqlalchemy.orm import Session

from app.chat.schemas import SafetyLevel, ToolInput, ToolOutput


class DataSourceSummary(ToolOutput):
    provider: str
    name: str
    status: str
    summary: str = ""


class ListDataSourcesIn(ToolInput):
    pass


class ListDataSourcesOut(ToolOutput):
    total: int
    sources: list[DataSourceSummary]


class ListDataSourcesTool:
    name = "list_data_sources"
    description = (
        "List configured data sources (simulator, AWS CloudWatch, etc.) "
        "and their current connection status."
    )
    input_model = ListDataSourcesIn
    output_model = ListDataSourcesOut
    safety = SafetyLevel.SAFE

    def preview(self, args):
        return ""

    def execute(self, args: ListDataSourcesIn, *, db: Session, idempotency_key: str) -> ListDataSourcesOut:
        from app.api.routes.datasources import _live_sources
        items = _live_sources()
        return ListDataSourcesOut(
            total=len(items),
            sources=[DataSourceSummary(
                provider=s["provider"], name=s["name"], status=s["status"],
                summary=s.get("summary") or "",
            ) for s in items],
        )


class DataSourceConnCheckIn(ToolInput):
    provider: str


class DataSourceConnCheckOut(ToolOutput):
    provider: str
    ok: bool
    message: str
    latency_ms: int = 0


class DataSourceConnCheckTool:
    name = "test_data_source_connection"
    description = (
        "Test connectivity for a data source provider (simulated, aws, azure, "
        "gcp, prometheus, etc.). Non-mutating."
    )
    input_model = DataSourceConnCheckIn
    output_model = DataSourceConnCheckOut
    safety = SafetyLevel.SAFE

    def preview(self, args):
        return ""

    def execute(self, args: DataSourceConnCheckIn, *, db: Session, idempotency_key: str) -> DataSourceConnCheckOut:
        from app.api.routes.datasources import test_connection, ConnectionTestRequest
        result = test_connection(ConnectionTestRequest(provider=args.provider, config={}))
        return DataSourceConnCheckOut(
            provider=args.provider, ok=bool(result.get("success")),
            message=result.get("message", ""),
            latency_ms=int(result.get("latency_ms") or 0),
        )


class ReconnectDataSourceIn(ToolInput):
    provider: str


class ReconnectDataSourceOut(ToolOutput):
    provider: str
    ok: bool
    message: str


def _run_async(coro, timeout: float = 35.0):
    """Run an async coroutine from sync code regardless of whether an event
    loop is already running on this thread (it is, during an SSE request).
    A dedicated thread owns a fresh loop so we never touch the live one."""
    box: dict = {}
    def _runner():
        try:
            box["value"] = asyncio.run(coro)
        except Exception as exc:  # noqa: BLE001
            box["error"] = exc
    t = threading.Thread(target=_runner, daemon=True)
    t.start()
    t.join(timeout=timeout)
    if "error" in box:
        raise box["error"]
    return box.get("value")


class ReconnectDataSourceTool:
    name = "reconnect_data_source"
    description = "Force the named adapter to reconnect using stored credentials. Idempotent."
    input_model = ReconnectDataSourceIn
    output_model = ReconnectDataSourceOut
    safety = SafetyLevel.SAFE

    def preview(self, args):
        return ""

    def execute(self, args: ReconnectDataSourceIn, *, db: Session, idempotency_key: str) -> ReconnectDataSourceOut:
        if args.provider != "aws":
            return ReconnectDataSourceOut(
                provider=args.provider, ok=False,
                message=f"Reconnect is only implemented for 'aws' so far")
        from app.api.routes.datasources import _activate_aws
        from app.services.settings_service import settings as _s
        cfg = {
            "aws_access_key_id": _s.cloudwatch_access_key_id,
            "aws_secret_access_key": _s.cloudwatch_secret_access_key,
            "region": _s.cloudwatch_region,
            "instance_ids": list(_s.cloudwatch_instance_ids or []),
            "log_groups": list(_s.cloudwatch_log_groups or []),
        }
        status, error = _run_async(_activate_aws(cfg))
        return ReconnectDataSourceOut(
            provider="aws", ok=(status == "connected"), message=error or status)


class DisconnectDataSourceIn(ToolInput):
    provider: str


class DisconnectDataSourceOut(ToolOutput):
    provider: str
    disconnected: bool


class DisconnectDataSourceTool:
    name = "disconnect_data_source"
    description = (
        "Disconnect a data source provider. Risky — clears stored "
        "credentials for that provider."
    )
    input_model = DisconnectDataSourceIn
    output_model = DisconnectDataSourceOut
    safety = SafetyLevel.RISKY

    def preview(self, args: DisconnectDataSourceIn) -> str:
        return f"Disconnect '{args.provider}' and clear its stored credentials."

    def execute(self, args: DisconnectDataSourceIn, *, db: Session, idempotency_key: str) -> DisconnectDataSourceOut:
        from app.api.routes.datasources import remove_datasource
        remove_datasource(args.provider)
        return DisconnectDataSourceOut(provider=args.provider, disconnected=True)
