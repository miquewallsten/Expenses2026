#!/usr/bin/env python3
"""Debug script to test auth endpoint directly."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from apps.api.routes.auth import router
from apps.api.deps import get_db

app = FastAPI()
app.include_router(router)

def test_auth_endpoint():
    """Test auth endpoint directly."""
    print("Testing auth endpoint directly...")
    
    with TestClient(app) as client:
        try:
            response = client.post("/auth/magic-link/request", json={"email": "superadmin@company.com"})
            print(f"Status: {response.status_code}")
            print(f"Response: {response.json()}")
            
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    test_auth_endpoint()