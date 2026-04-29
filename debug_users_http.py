#!/usr/bin/env python3
"""Debug script to test users endpoint in HTTP context."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from apps.api.routes.super_admin import router
from apps.api.deps import get_db

app = FastAPI()
app.include_router(router)

def test_users_endpoint_http():
    """Test users endpoint in HTTP context."""
    print("Testing users endpoint in HTTP context...")
    
    with TestClient(app) as client:
        try:
            response = client.get("/super-admin/users")
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"✓ SUCCESS: {len(data)} users found")
            else:
                print("✗ FAILED")
                
        except Exception as e:
            print(f"✗ ERROR: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    test_users_endpoint_http()