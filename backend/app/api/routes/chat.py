from __future__ import annotations
"""Chat endpoints for the SRE Copilot: streaming chat, confirmation, health."""

import json
import logging
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.chat.confirm_store import store as confirm_store
from app.chat.orchestrator import _friendly_llm_error, run_turn_streaming
from app.chat.registry import registry as _global_registry
from app.database.session import SessionLocal
from app.services.settings_service import settings

logger = logging.getLogger("itops.api.chat")
router = APIRouter(prefix="/chat", tags=["Chat"])


def _ensure_tools_registered() -> None:
    """Idempotent registration of the full tool catalog."""
    if _global_registry.get("list_nodes"):
        return
    from app.chat.tools.infra import (
        ListNodesTool, GetNodeTool, GetNodeLogsTool, GetNodeMetricsTool,
        ListIncidentsTool, GetIncidentTool, GetDashboardOverviewTool,
    )
    from app.chat.tools.runbooks import (
        ListRunbooksTool, SearchRunbooksTool, DeleteRunbookTool, DraftRunbookTool,
    )
    from app.chat.tools.simulators import (
        ListSimulatorsTool, ControlSimulatorTool, DeleteSimulatorTool,
    )
    from app.chat.tools.pipeline import (
        RunPipelineTool, RunPipelineBatchTool, ListRecentPipelineRunsTool,
    )
    from app.chat.tools.datasources import (
        ListDataSourcesTool, DataSourceConnCheckTool,
        ReconnectDataSourceTool, DisconnectDataSourceTool,
    )
    from app.chat.tools.settings import (
        GetSettingsTool, UpdateSettingTool, PurgeSelfEmittedLogsTool,
    )
    for cls in (
        ListNodesTool, GetNodeTool, GetNodeLogsTool, GetNodeMetricsTool,
        ListIncidentsTool, GetIncidentTool, GetDashboardOverviewTool,
        ListRunbooksTool, SearchRunbooksTool, DeleteRunbookTool, DraftRunbookTool,
        ListSimulatorsTool, ControlSimulatorTool, DeleteSimulatorTool,
        RunPipelineTool, RunPipelineBatchTool, ListRecentPipelineRunsTool,
        ListDataSourcesTool, DataSourceConnCheckTool,
        ReconnectDataSourceTool, DisconnectDataSourceTool,
        GetSettingsTool, UpdateSettingTool, PurgeSelfEmittedLogsTool,
    ):
        _global_registry.register(cls())


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    session_id: str
    messages: list[ChatMessage]


class ConfirmRequest(BaseModel):
    session_id: str
    confirmation_id: str
    decision: str = Field(..., pattern="^(run|cancel)$")


@router.post("")
async def chat_sse(body: ChatRequest, request: Request):
    """Stream a chat turn as Server-Sent Events."""
    _ensure_tools_registered()
    api_key = settings.get_secret("gemini_api_key")
    if not api_key:
        raise HTTPException(503, "No Gemini API key configured")

    conversation_id = str(uuid.uuid4())

    async def event_gen():
        # Own the DB session for the streaming lifetime rather than relying
        # on request-scoped dependency teardown, which is fragile mid-stream.
        db = SessionLocal()
        try:
            async for evt in run_turn_streaming(
                messages=[m.model_dump() for m in body.messages],
                registry=_global_registry, db=db,
                session_id=body.session_id, conversation_id=conversation_id,
                api_key=api_key, confirm_store=confirm_store,
            ):
                if await request.is_disconnected():
                    logger.info("SSE client disconnected; aborting turn")
                    return
                yield f"data: {json.dumps(evt)}\n\n"
        except Exception as exc:  # noqa: BLE001
            logger.exception("SSE generator crashed")
            yield f"data: {json.dumps({'event': 'error', 'data': {'message': _friendly_llm_error(exc)}})}\n\n"
            yield f"data: {json.dumps({'event': 'done', 'data': {'terminated_reason': 'error'}})}\n\n"
        finally:
            db.close()

    return StreamingResponse(
        event_gen(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/confirm", status_code=204)
def confirm(body: ConfirmRequest):
    """Resolve a pending risky-tool confirmation."""
    ok = confirm_store.resolve(
        body.confirmation_id, session_id=body.session_id, decision=body.decision)
    if not ok:
        raise HTTPException(403, "Confirmation rejected (wrong session, expired, or already used)")
    return None


@router.get("/health")
def chat_health() -> dict:
    _ensure_tools_registered()
    return {
        "ok": True,
        "tools_registered": len(_global_registry.all()),
        "gemini_configured": bool(settings.get_secret("gemini_api_key")),
    }
