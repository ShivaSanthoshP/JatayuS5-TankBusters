"""Pytest bootstrap for the iTOps backend test suite.

This file MUST run before any `app.*` import so it can redirect the database
at a throwaway SQLite file. `app.config` reads `DATABASE_URL` at import time
and defaults to the production `itops.db`; without this redirect every test
that calls `init_db()` would write fixture rows into the real database.
"""

import os
import tempfile

# ── Redirect the DB before anything imports app.config ──────────────
_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp_db.close()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp_db.name}"

# Live LLM tests are opt-in. Default to skipped so CI never needs a key.
os.environ.setdefault("SKIP_LIVE_LLM_TESTS", "1")

import pytest  # noqa: E402
from app.database.models import Base  # noqa: E402
from app.database.session import engine  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_db():
    """Give every test a clean schema so row counts are deterministic
    regardless of test ordering."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
