import logging

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import sessionmaker

from app.config import DATABASE_URL
from app.database.models import Base

logger = logging.getLogger("itops.db")

_connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    _connect_args = {
        "check_same_thread": False,
        "timeout": 30,
    }

engine = create_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    echo=False,
)


if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _configure_sqlite(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.execute("PRAGMA busy_timeout=30000;")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# Lightweight column-add migrations for SQLite. Base.metadata.create_all()
# only creates missing tables; if a deployed instance has an older schema for
# a table, columns added in newer model revisions need explicit ALTER TABLE.
# Each entry: table -> {column_name: column_type_sql}.
_RUNTIME_MIGRATIONS: dict[str, dict[str, str]] = {
    "runbook_entries": {
        "issue_type": "VARCHAR(100)",
        "root_cause": "TEXT",
        "causal_chain": "JSON",
        "blast_radius": "JSON",
        "blast_radius_severity": "VARCHAR(20)",
        "recommended_actions": "JSON",
        "remediation_summary": "TEXT",
        "remediation_steps": "JSON",
        "artifacts": "JSON",
        "is_seeded": "BOOLEAN DEFAULT 0 NOT NULL",
    },
}


def _apply_runtime_migrations() -> None:
    """Add columns introduced by newer model revisions to existing tables.

    Idempotent — only adds columns that don't already exist. Skips tables
    that haven't been created yet (those will pick up the full schema from
    Base.metadata.create_all). SQLite-friendly; for other engines this still
    works for simple ADD COLUMN cases.
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    for table, columns in _RUNTIME_MIGRATIONS.items():
        if table not in existing_tables:
            continue
        existing_cols = {c["name"] for c in inspector.get_columns(table)}
        missing = {name: ddl for name, ddl in columns.items() if name not in existing_cols}
        if not missing:
            continue
        logger.info(f"Adding missing columns to {table}: {sorted(missing)}")
        with engine.begin() as conn:
            for name, ddl in missing.items():
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


def init_db():
    Base.metadata.create_all(bind=engine)
    _apply_runtime_migrations()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
