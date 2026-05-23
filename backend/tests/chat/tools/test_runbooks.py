from unittest.mock import patch

from app.chat.tools.runbooks import (
    ListRunbooksTool, ListRunbooksIn,
    SearchRunbooksTool, SearchRunbooksIn,
)
from app.database.session import SessionLocal, init_db
from app.database.models import RunbookEntry


def test_list_runbooks_includes_seeded():
    init_db()
    with SessionLocal() as db:
        db.add(RunbookEntry(title="OOM Kill", problem_pattern="memory pressure",
                            solution_steps="restart", is_seeded=True, issue_type="memory"))
        db.commit()
        out = ListRunbooksTool().execute(ListRunbooksIn(), db=db, idempotency_key="k")
        assert any(r.title == "OOM Kill" for r in out.runbooks)


def test_search_runbooks_uses_memory():
    init_db()
    with SessionLocal() as db:
        fake_hits = [{"document": "Runbook: nginx 503\n...",
                      "metadata": {"runbook_id": 1, "title": "nginx 503"},
                      "distance": 0.12}]
        with patch("app.chat.tools.runbooks.get_memory") as gm:
            gm.return_value.search_runbooks.return_value = fake_hits
            out = SearchRunbooksTool().execute(
                SearchRunbooksIn(query="nginx returning 503"),
                db=db, idempotency_key="k",
            )
        assert out.total == 1
        assert out.matches[0].title == "nginx 503"


def test_delete_runbook_blocks_seeded():
    from app.chat.tools.runbooks import DeleteRunbookTool, DeleteRunbookIn
    init_db()
    with SessionLocal() as db:
        db.add(RunbookEntry(title="seeded", problem_pattern="x",
                            solution_steps="y", is_seeded=True))
        db.commit()
        rb = db.query(RunbookEntry).first()
        out = DeleteRunbookTool().execute(
            DeleteRunbookIn(runbook_id=rb.id), db=db, idempotency_key="k")
        assert out.deleted is False
        assert "seeded" in out.message.lower()


def test_draft_runbook_returns_draft_without_writing():
    from app.chat.tools.runbooks import DraftRunbookTool, DraftRunbookIn
    init_db()
    with SessionLocal() as db:
        before = db.query(RunbookEntry).count()
        out = DraftRunbookTool().execute(
            DraftRunbookIn(
                title="Redis Connection Storm Recovery",
                issue_type="redis_connection_storm",
                problem_pattern="clients open connections faster than Redis can serve",
                recommended_actions=[{"action": "Restart the client pool", "priority": 1}],
            ),
            db=db, idempotency_key="k",
        )
        # Drafting must not persist anything.
        assert db.query(RunbookEntry).count() == before
        assert out.issue_type_exists is False
        assert out.draft["title"] == "Redis Connection Storm Recovery"
        assert out.draft["recommended_actions"][0]["action"] == "Restart the client pool"


def test_draft_runbook_flags_existing_issue_type():
    from app.chat.tools.runbooks import DraftRunbookTool, DraftRunbookIn
    init_db()
    with SessionLocal() as db:
        db.add(RunbookEntry(title="Disk Full", problem_pattern="x", solution_steps="y",
                            is_seeded=True, issue_type="disk_full"))
        db.commit()
        out = DraftRunbookTool().execute(
            DraftRunbookIn(title="Disk Full v2", issue_type="disk_full",
                           problem_pattern="disk exhausted"),
            db=db, idempotency_key="k",
        )
        assert out.issue_type_exists is True
        assert out.existing_runbook_id is not None
        assert "already exists" in out.note


def test_delete_runbook_succeeds_for_learned():
    from app.chat.tools.runbooks import DeleteRunbookTool, DeleteRunbookIn
    init_db()
    with SessionLocal() as db:
        db.add(RunbookEntry(title="learned", problem_pattern="x",
                            solution_steps="y", is_seeded=False))
        db.commit()
        rb = db.query(RunbookEntry).first()
        out = DeleteRunbookTool().execute(
            DeleteRunbookIn(runbook_id=rb.id), db=db, idempotency_key="k")
        assert out.deleted is True
        assert db.query(RunbookEntry).filter_by(id=rb.id).first() is None
