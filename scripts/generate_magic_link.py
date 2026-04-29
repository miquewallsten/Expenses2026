#!/usr/bin/env python3
"""
Generate a magic login link for the Super Admin user
"""

import sys
import os
sys.path.append('.')

from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from datetime import datetime, timedelta
import secrets
import hashlib

def generate_magic_link():
    """Generate a magic login link for the Super Admin"""
    
    # Database connection
    database_url = "postgresql://app:changeme@localhost:5432/financial_ops"
    
    try:
        engine = create_engine(database_url)
        
        with Session(engine) as db:
            # Find the Super Admin user
            from packages.core.platform.models import User, MagicLinkToken
            
            super_admin = db.query(User).filter_by(email='superadmin@company.com', is_super_admin=True).first()
            
            if not super_admin:
                print("❌ Super Admin user not found")
                return False
            
            # Generate magic link token
            token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            
            # Create magic link token
            magic_link = MagicLinkToken(
                user_id=super_admin.id,
                token_hash=token_hash,
                expires_at=datetime.utcnow() + timedelta(hours=24),
                used_at=None
            )
            
            db.add(magic_link)
            db.commit()
            
            # Generate the login URL
            login_url = f"http://localhost:3001/auth/magic-link/verify?token={token}"
            
            print(f"✅ MAGIC LINK GENERATED FOR SUPER ADMIN:")
            print(f"   User: {super_admin.email}")
            print(f"   Name: {super_admin.full_name}")
            print(f"   User ID: {super_admin.id}")
            print("")
            print(f"🔗 LOGIN URL:")
            print(f"   {login_url}")
            print("")
            print("🚀 INSTRUCTIONS:")
            print("   1. Click the link above")
            print("   2. You'll be logged in automatically")
            print("   3. Access the Super Admin portal")
            print("")
            print("⏰ Link expires in 24 hours")
            
            return True
            
    except Exception as e:
        print(f"❌ Error generating magic link: {e}")
        return False

if __name__ == "__main__":
    print("🔗 GENERATING SUPER ADMIN MAGIC LINK")
    print("=" * 50)
    success = generate_magic_link()
    
    if not success:
        print("")
        print("🎯 ALTERNATIVE ACCESS:")
        print("   Use command line interface:")
        print("   ./quick_admin status")
        print("   ./quick_admin skills")
        print("   ./quick_admin test")