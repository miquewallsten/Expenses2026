"""
Docker startup entrypoint.

Fresh DB  → create all tables from SQLAlchemy models, stamp alembic head
Existing DB → run alembic upgrade head (incremental migrations)
"""
import subprocess
import sys
import os

# Ensure /app is on the path when run as `python scripts/docker_entrypoint.py`
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlalchemy as sa


def _has_alembic_version(engine: sa.Engine) -> bool:
    with engine.connect() as conn:
        row = conn.execute(
            sa.text("SELECT to_regclass('public.alembic_version')")
        ).fetchone()
        return row is not None and row[0] is not None


def main() -> None:
    # Import after path is set up (run from /app)
    from apps.api.db import Base, engine  # noqa: F401 — registers all models via main imports

    # Pull in every model so Base.metadata is complete
    import apps.api.main  # noqa: F401

    if _has_alembic_version(engine):
        print("[entrypoint] Existing DB — running alembic upgrade head", flush=True)
        result = subprocess.run(["alembic", "upgrade", "head"])
    else:
        print("[entrypoint] Fresh DB — creating tables via create_all + stamp head", flush=True)
        with engine.connect() as conn:
            conn.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.commit()
        Base.metadata.create_all(engine)
        result = subprocess.run(["alembic", "stamp", "head"])

    if result.returncode != 0:
        sys.exit(result.returncode)

    _seed_demo_data(engine)


def _seed_demo_data(engine: sa.Engine) -> None:
    """Insert a demo company + one user per role if the DB is empty."""
    with engine.connect() as conn:
        count = conn.execute(sa.text("SELECT COUNT(*) FROM users")).scalar()
        if count and count > 0:
            return
        print("[entrypoint] Seeding demo users…", flush=True)
        conn.execute(sa.text(
            "INSERT INTO companies (id, name, slug) VALUES (1, 'Demo Company', 'demo') ON CONFLICT DO NOTHING"
        ))
        conn.execute(sa.text("""
            INSERT INTO users (company_id, email, full_name, role) VALUES
              (1, 'admin@demo.com',      'Admin User',       'admin'),
              (1, 'manager@demo.com',    'Manager User',     'manager'),
              (1, 'accounting@demo.com', 'Accounting User',  'accounting'),
              (1, 'employee@demo.com',   'Employee User',    'employee'),
              (1, 'executive@demo.com',  'Executive User',   'executive'),
              (1, 'secretary@demo.com',  'Executive Assistant User',   'secretary')
            ON CONFLICT (email) DO NOTHING
        """))
        conn.commit()
        print("[entrypoint] Demo users seeded.", flush=True)


if __name__ == "__main__":
    main()
