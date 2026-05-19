import os
from sqlalchemy import create_engine, text

db_url = os.environ.get("DATABASE_URL", "postgresql://app:changeme@db:5432/financial_ops")

try:
    engine = create_engine(db_url)
    with engine.connect() as conn:
        print("Checking platform_settings table...")
        
        # Add IMAP columns
        conn.execute(text("ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS imap_host VARCHAR(255)"))
        conn.execute(text("ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS imap_port INTEGER DEFAULT 993"))
        conn.execute(text("ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS imap_user VARCHAR(255)"))
        conn.execute(text("ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS imap_password VARCHAR(255)"))
        conn.execute(text("ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS imap_enabled BOOLEAN DEFAULT false"))
        
        # We can leave platform_whatsapp_token if it exists, it won't hurt, 
        # or we could drop it. Let's just focus on adding what's needed.
        
        conn.commit()
    print("SUCCESS: platform_settings table updated.")
except Exception as e:
    print(f"FAILED: {e}")
