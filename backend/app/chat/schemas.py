from __future__ import annotations
"""Shared types for the chat tool system.

ToolInput/ToolOutput are strict pydantic v2 bases — they reject unknown
fields so a hallucinated LLM argument can't slip through unchecked.
"""

from enum import Enum
from typing import Protocol, runtime_checkable

from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session


class SafetyLevel(str, Enum):
    SAFE = "safe"
    RISKY = "risky"


class ToolInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ToolOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")


@runtime_checkable
class Tool(Protocol):
    name: str
    description: str
    input_model: type[ToolInput]
    output_model: type[ToolOutput]
    safety: SafetyLevel

    def preview(self, args: ToolInput) -> str:
        """Plain-English 'what will change' for confirmation cards.
        Required for risky tools; safe tools may return ''."""
        ...

    def execute(self, args: ToolInput, *, db: Session, idempotency_key: str) -> ToolOutput:
        """Run the tool. Mutating tools must be idempotent on idempotency_key."""
        ...
