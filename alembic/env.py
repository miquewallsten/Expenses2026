from logging.config import fileConfig
import sys
import os

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Make the project root importable so model imports work.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load .env so settings.database_url is populated before any import.
from dotenv import load_dotenv
load_dotenv()

# Import Base so Alembic knows all table metadata for autogenerate.
from apps.api.db import Base, engine as project_engine  # noqa: E402

# Import every model module via the central aggregator so target_metadata
# is fully populated. Adding a new model? Update models_all.py — never
# add per-table imports here. Hand-curated lists drift; the aggregator
# is the single source of truth used by tests and migrations alike.
import packages.core.platform.models_all  # noqa: F401, E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = project_engine.url
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with project_engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            # One transaction per migration. Without this a failure in
            # migration N rolls back every migration 1..N-1 that ran in
            # the same chain — and the create_all fallback in
            # apps/api/main.py:_run_migrations then recreates tables
            # out-of-band, leaving alembic_version stamped at a stale
            # revision (the drift we hit during Phase 8.13 deploy).
            transaction_per_migration=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
