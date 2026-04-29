#!/usr/bin/env python3
"""
Direct Super Admin login bypass - no email required.
Run this to get immediate access to the Super Admin portal.
"""

import os
import sys
import jwt
from datetime import datetime, timedelta, timezone

# Add the project root to Python path
sys.path.insert(0, '/Users/mikaelwallsten/Projects/financial-ops-platform')

from apps.api.main import app
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from sqlalchemy.orm import Session

def create_superadmin_login_link():
    """Create a direct login link for the first super admin user"""
    
    # Get database session
    db: Session = next(get_db())
    
    # Find the first super admin user
    superadmin = db.query(User).filter(User.is_superadmin == True).first()
    
    if not superadmin:
        print("❌ No super admin user found!")
        print("Run: python scripts/create_superadmin.py")
        return None
    
    # Create JWT token
    auth_secret = os.getenv('AUTH_SECRET', 'dev-secret-change-in-production')
    
    payload = {
        'sub': str(superadmin.id),
        'email': superadmin.email,
        'company_id': superadmin.company_id,
        'exp': datetime.now(tz=timezone.utc) + timedelta(hours=24),
        'iss': 'financial-ops-platform',
        'aud': 'financial-ops-platform',
    }
    
    token = jwt.encode(payload, auth_secret, algorithm='HS256')
    
    # Create login URL
    base_url = os.getenv('BASE_URL', 'http://localhost:3000')
    login_url = f"{base_url}/api/auth/superadmin-direct?token={token}"
    
    print(f"✅ Super Admin Login Link:")
    print(f"📧 User: {superadmin.email}")
    print(f"🔗 URL: {login_url}")
    print(f"\n📋 Copy and paste this URL into your browser to login immediately!")
    
    return login_url

if __name__ == "__main__":
    create_superadmin_login_link()