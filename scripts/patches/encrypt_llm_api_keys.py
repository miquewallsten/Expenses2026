#!/usr/bin/env python3
"""One-time migration: encrypt plaintext api_key values in llm_provider_configs.

Run once after deploying the crypto_utils change:
    python scripts/patches/encrypt_llm_api_keys.py

This script:
1. Reads all LLMProviderConfig rows
2. For rows where api_key is not already Fernet-encrypted, encrypts it
3. Commits the changes
"""
import os
import sys

# Ensure project root is on path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from dotenv import load_dotenv
load_dotenv()

from apps.api.db import SessionLocal
from packages.modules.agent.models_definitions import LLMProviderConfig
from packages.core.platform.crypto_utils import encrypt_secret, is_encrypted


def main():
    db = SessionLocal()
    try:
        rows = db.query(LLMProviderConfig).all()
        updated = 0
        for row in rows:
            if row.api_key and not is_encrypted(row.api_key) and not row.api_key.startswith("plain:"):
                row.api_key = encrypt_secret(row.api_key)
                updated += 1
            elif row.api_key and row.api_key.startswith("plain:"):
                # Migrate from plaintext prefix to Fernet
                row.api_key = encrypt_secret(row.api_key[len("plain:"):])
                updated += 1
        if updated:
            db.commit()
            print(f"Encrypted {updated} API key(s)")
        else:
            print("No plaintext API keys found — nothing to do")
    finally:
        db.close()


if __name__ == "__main__":
    main()
