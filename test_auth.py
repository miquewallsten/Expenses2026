#!/usr/bin/env python3
"""Test script to verify super admin authentication"""

import requests
import json

# Test the direct super admin login
token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJzdXBlcmFkbWluQGV4YW1wbGUuY29tIiwiY29tcGFueV9pZCI6MSwiZXhwIjoxNzc3NTEwMDA0LCJpc3MiOiJmaW5hbmNpYWwtb3BzLXBsYXRmb3JtIiwiYXVkIjoiZmluYW5jaWFsLW9wcy1wbGF0Zm9ybSJ9.ryFCMghn7XVXwU2PK7Ui6zwwKIT_H1d9mCHN-_YlAmQ"
url = f"http://localhost:8001/api/auth/superadmin-direct?token={token}"

try:
    response = requests.get(url, timeout=10)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 200:
        data = response.json()
        print("✅ Login successful!")
        print(f"Token: {data['token']}")
        print(f"User: {data['email']}")
        print(f"Super Admin: {data['is_super_admin']}")
    else:
        print("❌ Login failed")
        
except requests.exceptions.RequestException as e:
    print(f"❌ Connection error: {e}")
except Exception as e:
    print(f"❌ Error: {e}")