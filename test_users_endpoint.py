#!/usr/bin/env python3
"""Test script to debug users endpoint."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from apps.api.db import SessionLocal
from apps.api.routes.super_admin import list_all_users

async def test_users_endpoint():
    """Test the users endpoint directly."""
    print("Testing users endpoint...")
    
    try:
        db = SessionLocal()
        result = await list_all_users(db)
        print(f"✓ SUCCESS: {len(result)} users found")
        for user in result[:3]:  # Show first 3 users
            print(f"  - {user['email']} ({user['role']})")
    except Exception as e:
        print(f"✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    import asyncio
    asyncio.run(test_users_endpoint())