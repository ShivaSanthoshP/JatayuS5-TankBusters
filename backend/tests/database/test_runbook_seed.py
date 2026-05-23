from unittest.mock import patch

from app.database.runbook_seed import ISSUE_PROFILES, seed_canonical_runbooks
from app.database.models import RunbookEntry
from app.database.session import SessionLocal


def _seeded_issue_types(db):
    return {
        t for (t,) in db.query(RunbookEntry.issue_type)
        .filter(RunbookEntry.is_seeded.is_(True)).all() if t
    }


def test_seed_creates_all_canonical_runbooks():
    with patch("app.memory.vector_store.get_memory"):
        counts = seed_canonical_runbooks()
    assert counts["created"] == len(ISSUE_PROFILES)
    assert counts["updated"] == 0
    with SessionLocal() as db:
        assert _seeded_issue_types(db) == set(ISSUE_PROFILES)


def test_seed_is_idempotent():
    with patch("app.memory.vector_store.get_memory"):
        seed_canonical_runbooks()
        again = seed_canonical_runbooks()
    # Second run upserts the same rows — refresh, not duplicate.
    assert again["created"] == 0
    assert again["updated"] == len(ISSUE_PROFILES)
    with SessionLocal() as db:
        assert db.query(RunbookEntry).filter(RunbookEntry.is_seeded.is_(True)).count() == len(ISSUE_PROFILES)


def test_only_if_missing_seeds_empty_db_then_skips():
    with patch("app.memory.vector_store.get_memory"):
        first = seed_canonical_runbooks(only_if_missing=True)
        second = seed_canonical_runbooks(only_if_missing=True)
    assert first["created"] == len(ISSUE_PROFILES)
    assert first["skipped"] is False
    # Everything already present — startup guard makes this a no-op.
    assert second["skipped"] is True
    assert second["created"] == 0
    assert second["updated"] == 0


def test_only_if_missing_reseeds_when_one_is_absent():
    with patch("app.memory.vector_store.get_memory"):
        seed_canonical_runbooks()
        with SessionLocal() as db:
            row = db.query(RunbookEntry).filter_by(issue_type="disk_full").one()
            db.delete(row)
            db.commit()
        # A canonical type is now missing, so the guard must run a full upsert.
        counts = seed_canonical_runbooks(only_if_missing=True)
    assert counts["skipped"] is False
    assert counts["created"] == 1          # disk_full re-created
    assert counts["updated"] == len(ISSUE_PROFILES) - 1
    with SessionLocal() as db:
        assert _seeded_issue_types(db) == set(ISSUE_PROFILES)
