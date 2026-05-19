import os
from sqlalchemy import create_engine
from apps.api.db import Base
from alembic.config import Config
from alembic import command
import packages.core.platform.models_all # Load all models

db_url = os.environ.get("DATABASE_URL", "postgresql://app:changeme@db:5432/financial_ops")

try:
    engine = create_engine(db_url)
    
    print("Creating all tables from current models...")
    Base.metadata.create_all(bind=engine)
    print("Tables created successfully.")
    
    # Now stamp the DB with the latest alembic head
    print("Stamping database with latest alembic head...")
    alembic_cfg = Config("alembic.ini")
    command.stamp(alembic_cfg, "head")
    print("SUCCESS: Database is now green and up-to-date.")
except Exception as e:
    print(f"FAILED: {e}")
