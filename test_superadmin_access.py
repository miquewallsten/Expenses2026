#!/usr/bin/env python3
"""Test script to verify Super Admin API access."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

import asyncio
import aiohttp

async def test_superadmin_api():
    """Test Super Admin API endpoints."""
    base_url = "http://localhost:8002"
    
    endpoints = [
        "/super-admin/tenants",
        "/super-admin/agents/status", 
        "/super-admin/system-health",
        "/super-admin/users",
        "/super-admin/stats"
    ]
    
    async with aiohttp.ClientSession() as session:
        for endpoint in endpoints:
            try:
                async with session.get(f"{base_url}{endpoint}") as response:
                    if response.status == 200:
                        data = await response.json()
                        print(f"✓ {endpoint}: SUCCESS ({len(data) if isinstance(data, list) else 'object'})")
                    else:
                        print(f"✗ {endpoint}: FAILED ({response.status})")
            except Exception as e:
                print(f"✗ {endpoint}: ERROR ({e})")

if __name__ == "__main__":
    print("Testing Super Admin API endpoints...")
    asyncio.run(test_superadmin_api())