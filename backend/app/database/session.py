import logging

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import sessionmaker

from app.config import DATABASE_URL
from app.database.models import Base

logger = logging.getLogger("itops.db")

_IS_SQLITE = DATABASE_URL.startswith("sqlite")
_IS_POSTGRES = DATABASE_URL.startswith("postgres")

_connect_args: dict = {}
_engine_kwargs: dict = {"echo": False}

if _IS_SQLITE:
    _connect_args = {
        "check_same_thread": False,
        "timeout": 30,
    }
elif _IS_POSTGRES:
    # Conservative pool sized for a 2-vCPU / 2 GiB t4g.small running 2 uvicorn
    # workers. Each worker gets its own pool, so total real connections is
    # workers * (pool_size + max_overflow). pool_pre_ping survives the
    # PostgreSQL idle-connection drop without surprising the request.
    _engine_kwargs.update(
        pool_size=5,
        max_overflow=5,
        pool_pre_ping=True,
        pool_recycle=1800,
    )

engine = create_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    **_engine_kwargs,
)


if _IS_SQLITE:
    @event.listens_for(engine, "connect")
    def _configure_sqlite(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.execute("PRAGMA busy_timeout=30000;")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# Lightweight column-add migrations. Base.metadata.create_all() only creates
# missing tables; if a deployed instance has an older schema for a table,
# columns added in newer model revisions need explicit ALTER TABLE. The DDL
# below uses ANSI keywords (FALSE, not 0) so it works on both SQLite and
# PostgreSQL — SQLite accepts FALSE as an alias for 0 on BOOLEAN columns.
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
        "is_seeded": "BOOLEAN DEFAULT FALSE NOT NULL",
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
    flavor = "PostgreSQL" if _IS_POSTGRES else ("SQLite" if _IS_SQLITE else engine.dialect.name)
    logger.info(f"Using {flavor} database ({engine.url.render_as_string(hide_password=True)})")
    Base.metadata.create_all(bind=engine)
    _apply_runtime_migrations()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
