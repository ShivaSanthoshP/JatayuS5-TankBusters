from __future__ import annotations
"""In-memory store of pending risky-tool calls awaiting user confirmation.

Each entry carries an asyncio.Event the orchestrator awaits; the /confirm
endpoint sets it. Entries are session-bound, single-use, and TTL-bounded.
"""

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class PendingDecision(str, Enum):
    RUN = "run"
    CANCEL = "cancel"
    TIMEOUT = "timeout"


@dataclass
class _Entry:
    confirmation_id: str
    session_id: str
    tool: str
    args: dict[str, Any]
    summary: str
    created_at: float
    event: asyncio.Event = field(default_factory=asyncio.Event)
    decision: PendingDecision | None = None
    resolved: bool = False


class ConfirmStore:
    def __init__(self, ttl_seconds: int = 300):
        self._ttl = ttl_seconds
        self._entries: dict[str, _Entry] = {}

    def create(self, *, session_id: str, tool: str, args: dict, summary: str) -> str:
        cid = str(uuid.uuid4())
        self._entries[cid] = _Entry(
            confirmation_id=cid, session_id=session_id, tool=tool,
            args=args, summary=summary, created_at=time.time(),
        )
        return cid

    def get(self, cid: str) -> _Entry | None:
        entry = self._entries.get(cid)
        if entry is None or self._expired(entry):
            return None
        return entry

    def resolve(self, cid: str, *, session_id: str, decision: str) -> bool:
        entry = self._entries.get(cid)
        if entry is None or entry.resolved or self._expired(entry):
            return False
        if entry.session_id != session_id:
            return False
        try:
            entry.decision = PendingDecision(decision)
        except ValueError:
            return False
        entry.resolved = True
        entry.event.set()
        return True

    async def wait_for_decision(self, cid: str) -> PendingDecision:
        entry = self._entries.get(cid)
        if entry is None:
            return PendingDecision.TIMEOUT
        try:
            remaining = self._ttl - (time.time() - entry.created_at)
            await asyncio.wait_for(entry.event.wait(), timeout=max(remaining, 0.1))
        except asyncio.TimeoutError:
            entry.decision = PendingDecision.TIMEOUT
            entry.resolved = True
        return entry.decision or PendingDecision.TIMEOUT

    def _expired(self, entry: _Entry) -> bool:
        return (time.time() - entry.created_at) > self._ttl


# Module-level singleton used across the app
store = ConfirmStore()
