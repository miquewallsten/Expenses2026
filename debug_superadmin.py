#!/usr/bin/env python3
"""Debug script for Super Admin API issues."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from apps.api.db import SessionLocal
from apps.api.routes.super_admin import list_all_tenants

async def test_superadmin():
    """Test Super Admin functionality."""
    print("Testing Super Admin API...")
    
    try:
        db = SessionLocal()
        result = await list_all_tenants(db)
        print(f"Success: {len(result)} tenants found")
        for tenant in result:
            print(f"  - {tenant['name']} (ID: {tenant['id']})")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    import asyncio
    asyncio.run(test_superadmin())