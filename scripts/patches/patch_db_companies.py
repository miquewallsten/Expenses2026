import os
from sqlalchemy import create_engine, text

db_url = os.environ.get("DATABASE_URL", "postgresql://app:changeme@db:5432/financial_ops")

try:
    engine = create_engine(db_url)
    with engine.connect() as conn:
        print("Adding is_active column to companies table if it doesn't exist...")
        conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true"))
        conn.commit()
    print("SUCCESS: companies table updated.")
except Exception as e:
    print(f"FAILED: {e}")
