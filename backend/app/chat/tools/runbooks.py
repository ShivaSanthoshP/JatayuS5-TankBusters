from __future__ import annotations
"""Runbook tools for the SRE Copilot."""

from sqlalchemy.orm import Session

from app.chat.schemas import SafetyLevel, ToolInput, ToolOutput
from app.api.schemas import RecommendedActionIn, RemediationStepIn, RunbookArtifactIn
from app.database.models import RunbookEntry
from app.memory.vector_store import get_memory


class RunbookSummary(ToolOutput):
    id: int
    title: str
    issue_type: str | None = None
    is_seeded: bool = False
    effectiveness_score: float = 0.0


class ListRunbooksIn(ToolInput):
    seeded_only: bool = False
    limit: int = 50


class ListRunbooksOut(ToolOutput):
    total: int
    runbooks: list[RunbookSummary]


class ListRunbooksTool:
    name = "list_runbooks"
    description = "List runbooks in the store. Use seeded_only=true to see only canonical ones."
    input_model = ListRunbooksIn
    output_model = ListRunbooksOut
    safety = SafetyLevel.SAFE

    def preview(self, args):
        return ""

    def execute(self, args: ListRunbooksIn, *, db: Session, idempotency_key: str) -> ListRunbooksOut:
        q = db.query(RunbookEntry)
        if args.seeded_only:
            q = q.filter(RunbookEntry.is_seeded.is_(True))
        rows = q.order_by(RunbookEntry.created_at.desc()).limit(args.limit).all()
        return ListRunbooksOut(
            total=len(rows),
            runbooks=[RunbookSummary(
                id=r.id, title=r.title, issue_type=r.issue_type,
                is_seeded=bool(r.is_seeded),
                effectiveness_score=float(r.effectiveness_score or 0),
            ) for r in rows],
        )


class RunbookMatch(ToolOutput):
    runbook_id: int
    title: str
    distance: float
    snippet: str


class SearchRunbooksIn(ToolInput):
    query: str
    n_results: int = 5


class SearchRunbooksOut(ToolOutput):
    total: int
    matches: list[RunbookMatch]


class SearchRunbooksTool:
    name = "search_runbooks"
    description = (
        "Semantic search across runbooks. Use when the user describes a symptom "
        "('nginx 503', 'OOM kill') and you need the best matching playbook."
    )
    input_model = SearchRunbooksIn
    output_model = SearchRunbooksOut
    safety = SafetyLevel.SAFE

    def preview(self, args):
        return ""

    def execute(self, args: SearchRunbooksIn, *, db: Session, idempotency_key: str) -> SearchRunbooksOut:
        hits = get_memory().search_runbooks(args.query, args.n_results)
        return SearchRunbooksOut(
            total=len(hits),
            matches=[RunbookMatch(
                runbook_id=int((h.get("metadata") or {}).get("runbook_id", 0)),
                title=(h.get("metadata") or {}).get("title", ""),
                distance=float(h.get("distance", 0)),
                snippet=(h.get("document") or "")[:300],
            ) for h in hits],
        )


# ── delete_runbook (risky) ──────────────────────────────────────────

class DeleteRunbookIn(ToolInput):
    runbook_id: int


class DeleteRunbookOut(ToolOutput):
    runbook_id: int
    deleted: bool
    message: str


class DeleteRunbookTool:
    name = "delete_runbook"
    description = "Delete a runbook by id (DB row + vector store entry). Deletion is permanent."
    input_model = DeleteRunbookIn
    output_model = DeleteRunbookOut
    safety = SafetyLevel.RISKY

    def preview(self, args: DeleteRunbookIn) -> str:
        return f"Delete runbook #{args.runbook_id} (DB row + vector store entry)."

    def execute(self, args: DeleteRunbookIn, *, db: Session, idempotency_key: str) -> DeleteRunbookOut:
        rb = db.query(RunbookEntry).filter_by(id=args.runbook_id).one_or_none()
        if rb is None:
            return DeleteRunbookOut(runbook_id=args.runbook_id, deleted=False,
                                    message="Runbook not found")
        db.delete(rb)
        db.commit()
        try:
            get_memory().delete_runbook(args.runbook_id)
        except Exception:  # noqa: BLE001
            pass
        return DeleteRunbookOut(runbook_id=args.runbook_id, deleted=True,
                                message=f"Deleted runbook #{args.runbook_id}")


# ── draft_runbook (drafts only — no DB write) ───────────────────────

class DraftRunbookIn(ToolInput):
    title: str = ""
    issue_type: str | None = None
    problem_pattern: str = ""
    root_cause: str | None = None
    causal_chain: list[str] | None = None
    blast_radius: list[str] | None = None
    blast_radius_severity: str | None = None
    recommended_actions: list[RecommendedActionIn] | None = None
    remediation_summary: str | None = None
    remediation_steps: list[RemediationStepIn] | None = None
    artifacts: list[RunbookArtifactIn] | None = None


class DraftRunbookOut(ToolOutput):
    draft: dict
    issue_type_exists: bool = False
    existing_runbook_id: int | None = None
    note: str


class DraftRunbookTool:
    name = "draft_runbook"
    description = (
        "Draft a NEW canonical runbook from the conversation for the human to review "
        "and save — use when the user asks to create, add, author, or seed a runbook. "
        "Fill in every field you reasonably can from the discussion and your SRE "
        "knowledge: issue_type as lowercase_with_underscores, problem_pattern, "
        "root_cause, causal_chain, blast_radius (+ severity), recommended_actions, "
        "remediation_summary, remediation_steps (with shell scripts + validation), and "
        "artifacts. This does NOT save anything — it opens a prefilled form the user "
        "verifies, edits, and approves. Do not claim the runbook was created."
    )
    input_model = DraftRunbookIn
    output_model = DraftRunbookOut
    safety = SafetyLevel.SAFE

    def preview(self, args):
        return ""

    def execute(self, args: DraftRunbookIn, *, db: Session, idempotency_key: str) -> DraftRunbookOut:
        draft = args.model_dump()
        issue_type = (args.issue_type or "").strip() or None
        exists = False
        existing_id: int | None = None
        if issue_type:
            row = db.query(RunbookEntry).filter(RunbookEntry.issue_type == issue_type).one_or_none()
            if row is not None:
                exists, existing_id = True, row.id

        if exists:
            note = (
                f"A runbook for issue_type '{issue_type}' already exists (#{existing_id}). "
                "Change the issue_type before saving, or edit the existing one instead."
            )
        else:
            note = "Draft ready — opening a prefilled form for you to review, edit, and save."
        return DraftRunbookOut(
            draft=draft, issue_type_exists=exists, existing_runbook_id=existing_id, note=note,
        )
