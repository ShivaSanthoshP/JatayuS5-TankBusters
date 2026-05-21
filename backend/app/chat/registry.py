from __future__ import annotations
"""Tool registry: validates args, enforces timeout, writes audit log,
honours idempotency on (session_id, tool_name, tool_args)."""

import time
import logging
from typing import Any

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.chat.schemas import Tool, ToolOutput
from app.database.models import ChatAction

logger = logging.getLogger("itops.chat.registry")


class ToolExecutionError(Exception):
    """Raised when a tool can't be dispatched cleanly. Always carries a
    user-safe message; the orchestrator feeds that back to the LLM."""
    def __init__(self, message: str, *, kind: str = "error"):
        super().__init__(message)
        self.kind = kind  # error | timeout | not_found | invalid_args


class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def all(self) -> list[Tool]:
        return list(self._tools.values())

    def dispatch(
        self,
        name: str,
        raw_args: dict[str, Any],
        *,
        db: Session,
        session_id: str,
        conversation_id: str,
        was_confirmed: bool,
        idempotency_key: str,
    ) -> ToolOutput:
        tool = self._tools.get(name)
        if tool is None:
            self._write_audit(db, session_id, conversation_id, name, raw_args,
                              status="error", was_confirmed=was_confirmed,
                              latency_ms=0, error="unknown tool", result=None)
            raise ToolExecutionError(f"Unknown tool: {name}", kind="not_found")

        # Idempotency: replay a prior successful row with the same
        # (session_id, tool_name, tool_args). Guards against a retry
        # double-firing a mutating tool.
        #
        # tool_args is a JSON column. PostgreSQL has no `=` operator for
        # the `json` type (only `jsonb` does), so comparing it in the
        # query — `ChatAction.tool_args == raw_args` — raises
        # UndefinedFunction on Postgres while silently working on SQLite.
        # We therefore filter on the indexed scalar columns in SQL and
        # compare tool_args as dicts in Python: portable across engines
        # and key-order independent. The limit bounds the scan to the
        # recent window where any genuine retry would live.
        recent_ok = (
            db.query(ChatAction)
            .filter(
                ChatAction.session_id == session_id,
                ChatAction.tool_name == name,
                ChatAction.status == "ok",
            )
            .order_by(ChatAction.id.desc())
            .limit(50)
            .all()
        )
        prior = next(
            (row for row in recent_ok
             if row.tool_result is not None and row.tool_args == raw_args),
            None,
        )
        if prior is not None:
            logger.info("Idempotent replay for %s (key=%s)", name, idempotency_key)
            return tool.output_model.model_validate(prior.tool_result)

        try:
            args = tool.input_model.model_validate(raw_args)
        except ValidationError as ve:
            self._write_audit(db, session_id, conversation_id, name, raw_args,
                              status="error", was_confirmed=was_confirmed,
                              latency_ms=0, error=str(ve)[:500], result=None)
            raise ToolExecutionError(
                f"Invalid args for {name}: {ve.errors()[0]['msg']}", kind="invalid_args")

        # Tools run in the calling thread: they all touch the SQLAlchemy
        # session, which is not safe to hand to a worker thread. Tool bodies
        # here are fast (DB queries / in-process calls), so a hard timeout
        # isn't worth the cross-thread session hazard.
        t0 = time.time()
        try:
            result = tool.execute(args, db=db, idempotency_key=idempotency_key)
        except Exception as exc:
            elapsed = int((time.time() - t0) * 1000)
            self._write_audit(db, session_id, conversation_id, name, raw_args,
                              status="error", was_confirmed=was_confirmed,
                              latency_ms=elapsed, error=str(exc)[:500], result=None)
            raise ToolExecutionError(f"{name} failed: {exc}", kind="error")

        elapsed = int((time.time() - t0) * 1000)
        if not isinstance(result, ToolOutput):
            self._write_audit(db, session_id, conversation_id, name, raw_args,
                              status="error", was_confirmed=was_confirmed,
                              latency_ms=elapsed, error="tool returned non-ToolOutput",
                              result=None)
            raise ToolExecutionError(f"{name} returned an invalid result", kind="error")

        self._write_audit(db, session_id, conversation_id, name, raw_args,
                          status="ok", was_confirmed=was_confirmed,
                          latency_ms=elapsed, error=None, result=result.model_dump())
        return result

    @staticmethod
    def _write_audit(
        db: Session, session_id: str, conversation_id: str, tool_name: str,
        tool_args: dict, *, status: str, was_confirmed: bool, latency_ms: int,
        error: str | None, result: dict | None,
    ) -> None:
        db.add(ChatAction(
            session_id=session_id, conversation_id=conversation_id,
            tool_name=tool_name, tool_args=tool_args, tool_result=result or {},
            status=status, was_confirmed=was_confirmed,
            latency_ms=latency_ms, error_message=error,
        ))
        db.commit()


registry = ToolRegistry()
