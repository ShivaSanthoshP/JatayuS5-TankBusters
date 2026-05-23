"""Seed canonical runbooks into the database and vector store.

Run once against a fresh DB (or any time you want to re-sync the canonical set):

    cd backend
    python -m scripts.seed_runbooks

This is a thin CLI wrapper. The actual seeding logic lives in
`app.database.runbook_seed` so it can also run from the application lifespan
(in-process, using the same DATABASE_URL the service is configured with).

It is idempotent — each runbook is upserted by `issue_type`, so re-running
refreshes the canonical rows without disturbing incident-derived runbooks.
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

# Allow running as `python scripts/seed_runbooks.py` from the backend dir.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.database.runbook_seed import seed_canonical_runbooks  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


if __name__ == "__main__":
    seed_canonical_runbooks()
