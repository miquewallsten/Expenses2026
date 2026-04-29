#!/usr/bin/env python3
"""Test script to debug agent status endpoint."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from apps.api.routes.super_admin import get_global_agent_status

async def test_agent_status():
    """Test the agent status endpoint directly."""
    print("Testing agent status endpoint...")
    
    try:
        result = await get_global_agent_status()
        print(f"✓ SUCCESS: {len(result)} agent teams found")
        for team in result:
            print(f"  - {team['team']}: {team['status']}")
    except Exception as e:
        print(f"✗ ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    import asyncio
    asyncio.run(test_agent_status())