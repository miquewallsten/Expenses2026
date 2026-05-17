import os
from sqlalchemy import create_engine, text

db_url = os.environ.get("DATABASE_URL", "postgresql://app:changeme@db:5432/financial_ops")

try:
    engine = create_engine(db_url)
    with engine.connect() as conn:
        print("Adding api_key column to llm_provider_configs table if it doesn't exist...")
        conn.execute(text("ALTER TABLE llm_provider_configs ADD COLUMN IF NOT EXISTS api_key VARCHAR(512)"))
        conn.commit()
    print("SUCCESS: llm_provider_configs table updated.")
except Exception as e:
    print(f"FAILED: {e}")
