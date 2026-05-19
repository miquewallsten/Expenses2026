import asyncio
import sys
import os
sys.path.append('.')

from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from packages.core.platform.models_platform_settings import PlatformSettings
from packages.core.platform.service.mail_tester import test_smtp_connection, test_imap_connection

async def run_test():
    database_url = os.environ.get("DATABASE_URL", "postgresql://app:changeme@db:5432/financial_ops")
    engine = create_engine(database_url)
    
    with Session(engine) as db:
        platform = db.query(PlatformSettings).first()
        if not platform:
            print("❌ No platform settings found")
            return

        config = {
            "smtp_host": platform.smtp_host,
            "smtp_port": platform.smtp_port,
            "smtp_user": platform.smtp_user,
            "smtp_password": platform.smtp_password,
            "imap_host": platform.imap_host,
            "imap_port": platform.imap_port,
            "imap_user": platform.imap_user,
            "imap_password": platform.imap_password
        }

        print(f"Testing SMTP: {config['smtp_host']}:{config['smtp_port']} as {config['smtp_user']}")
        smtp_res = await test_smtp_connection(config)
        print(f"SMTP Result: {'✅ OK' if smtp_res['ok'] else '❌ FAILED'} - {smtp_res.get('message', smtp_res.get('error'))}")

        print(f"\nTesting IMAP: {config['imap_host']}:{config['imap_port']} as {config['imap_user']}")
        imap_res = await test_imap_connection(config)
        print(f"IMAP Result: {'✅ OK' if imap_res['ok'] else '❌ FAILED'} - {imap_res.get('message', imap_res.get('error'))}")

if __name__ == "__main__":
    asyncio.run(run_test())
