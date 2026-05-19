"""One-shot SQLite → PostgreSQL data migration for itops.

Run once when cutting a deployment over from SQLite to Postgres:

    cd backend
    # Target Postgres reached from DATABASE_URL (or pass --target).
    export DATABASE_URL='postgresql://itops:secret@localhost/itops'
    python -m scripts.migrate_sqlite_to_postgres \
        --source sqlite:///./itops.db \
        [--target postgresql://itops:secret@localhost/itops] \
        [--dry-run] [--truncate]

Behaviour:
- Creates the schema on the target (idempotent — Base.metadata.create_all).
- Copies every table in FK-dependency order, preserving primary keys.
- Resets each table's PK sequence on Postgres so new inserts pick up where
  SQLite left off.
- Refuses to overwrite a target that already has rows unless --truncate is
  given (so re-running by accident does not silently double-insert).
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import create_engine, text, select, func  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.database.models import Base  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("migrate")


def _row_count(session, table) -> int:
    return session.execute(select(func.count()).select_from(table)).scalar_one()


def _reset_pg_sequence(conn, table_name: str) -> None:
    """Move the Postgres serial sequence past the largest copied id."""
    conn.execute(text(f"""
        SELECT setval(
            pg_get_serial_sequence(:t, 'id'),
            COALESCE((SELECT MAX(id) FROM {table_name}), 1),
            (SELECT MAX(id) IS NOT NULL FROM {table_name})
        )
    """), {"t": table_name})


def migrate(source_url: str, target_url: str, *, dry_run: bool, truncate: bool) -> None:
    if not source_url.startswith("sqlite"):
        raise SystemExit(f"--source must be a sqlite:// URL, got {source_url!r}")
    if not target_url.startswith("postgres"):
        raise SystemExit(f"--target must be a postgresql:// URL, got {target_url!r}")

    logger.info("Source: %s", source_url)
    logger.info("Target: %s", target_url.split("@")[-1] if "@" in target_url else target_url)

    src_engine = create_engine(source_url, connect_args={"check_same_thread": False})
    tgt_engine = create_engine(target_url, pool_pre_ping=True)

    SrcSession = sessionmaker(bind=src_engine, autocommit=False, autoflush=False)
    TgtSession = sessionmaker(bind=tgt_engine, autocommit=False, autoflush=False)

    # 1. Ensure target schema exists.
    logger.info("Creating target schema (if missing)…")
    if not dry_run:
        Base.metadata.create_all(bind=tgt_engine)

    tables = list(Base.metadata.sorted_tables)  # FK-dependency order

    # 2. Sanity-check target is empty (unless truncate).
    with TgtSession() as tgt:
        for t in tables:
            n = _row_count(tgt, t)
            if n > 0:
                if truncate:
                    if dry_run:
                        logger.info("  [dry-run] would TRUNCATE %s (%d rows)", t.name, n)
                    else:
                        logger.warning("  TRUNCATE %s (had %d rows)", t.name, n)
                        tgt.execute(text(f'TRUNCATE TABLE "{t.name}" RESTART IDENTITY CASCADE'))
                        tgt.commit()
                else:
                    raise SystemExit(
                        f"Target table {t.name!r} already has {n} rows. "
                        f"Re-run with --truncate to wipe and reload, or point "
                        f"--target at a fresh database."
                    )

    # 3. Copy rows table by table.
    total = 0
    with SrcSession() as src, TgtSession() as tgt:
        for t in tables:
            rows = src.execute(select(t)).mappings().all()
            if not rows:
                logger.info("  %-25s  (empty)", t.name)
                continue
            logger.info("  %-25s  copying %d rows", t.name, len(rows))
            total += len(rows)
            if dry_run:
                continue
            tgt.execute(t.insert(), [dict(r) for r in rows])
            tgt.commit()

    # 4. Realign Postgres sequences so the next INSERT does not collide.
    if not dry_run:
        with tgt_engine.begin() as conn:
            for t in tables:
                if "id" in t.primary_key.columns:
                    _reset_pg_sequence(conn, t.name)
        logger.info("Sequences realigned.")

    logger.info("Done. %d rows copied across %d tables.%s",
                total, len(tables), " (dry-run)" if dry_run else "")


def _default_source() -> str:
    return f"sqlite:///{BACKEND_DIR / 'itops.db'}"


def _default_target() -> str:
    return os.getenv("DATABASE_URL", "")


def main() -> int:
    p = argparse.ArgumentParser(description="Copy itops data from SQLite to PostgreSQL.")
    p.add_argument("--source", default=_default_source(),
                   help=f"Source SQLite URL (default: {_default_source()})")
    p.add_argument("--target", default=_default_target(),
                   help="Target Postgres URL (default: $DATABASE_URL)")
    p.add_argument("--dry-run", action="store_true", help="Plan but do not write.")
    p.add_argument("--truncate", action="store_true",
                   help="Wipe target tables before reload (DANGEROUS).")
    args = p.parse_args()

    if not args.target:
        p.error("--target not given and DATABASE_URL is not set.")

    migrate(args.source, args.target, dry_run=args.dry_run, truncate=args.truncate)
    return 0


if __name__ == "__main__":
    sys.exit(main())
