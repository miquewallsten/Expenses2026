import os
from sqlalchemy import create_engine, text

db_url = os.environ.get("DATABASE_URL", "postgresql://app:changeme@db:5432/financial_ops")

try:
    engine = create_engine(db_url)
    with engine.connect() as conn:
        print("Updating channel_settings table with IMAP columns...")
        
        conn.execute(text("ALTER TABLE channel_settings ADD COLUMN IF NOT EXISTS email_imap_host VARCHAR(255)"))
        conn.execute(text("ALTER TABLE channel_settings ADD COLUMN IF NOT EXISTS email_imap_port INTEGER"))
        conn.execute(text("ALTER TABLE channel_settings ADD COLUMN IF NOT EXISTS email_imap_user VARCHAR(255)"))
        conn.execute(text("ALTER TABLE channel_settings ADD COLUMN IF NOT EXISTS email_imap_password TEXT"))
        conn.execute(text("ALTER TABLE channel_settings ADD COLUMN IF NOT EXISTS email_imap_enabled BOOLEAN DEFAULT false"))
        
        conn.commit()
    print("SUCCESS: channel_settings table updated.")
except Exception as e:
    print(f"FAILED: {e}")
