import sys
import os
sys.path.append('.')

from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from datetime import datetime, timedelta
import secrets
import hashlib
import uuid

# Models
from packages.core.platform.models import Company
from packages.core.platform.models_user import User, MagicLinkToken
from packages.core.platform.models_company_setup import CompanySetup

def create_first_tenant():
    # Inside Docker, the database host is 'db'
    database_url = os.environ.get("DATABASE_URL", "postgresql://app:changeme@db:5432/financial_ops")
    
    try:
        engine = create_engine(database_url)
        
        with Session(engine) as db:
            # 1. Create Company
            name = "XpenseFlow Labs"
            slug = "xpenseflow-labs"
            
            # Check if exists
            existing = db.query(Company).filter_by(slug=slug).first()
            if existing:
                print(f"⚠️ Tenant {slug} already exists. Using existing.")
                company = existing
            else:
                company = Company(
                    name=name,
                    slug=slug,
                    created_at=datetime.utcnow()
                )
                db.add(company)
                db.flush() # Get ID
                print(f"✅ Created Tenant: {name} ({slug})")
            
            # 2. Create CompanySetup (linked to Phase 1/2)
            setup = db.query(CompanySetup).filter_by(company_id=company.id).first()
            if not setup:
                setup = CompanySetup(
                    company_id=company.id,
                    onboarding_step=1,
                    updated_at=datetime.utcnow()
                )
                db.add(setup)
                print(f"✅ Initialized CompanySetup for Phase 1")

            # 3. Create Tenant Admin
            admin_email = "admin@xpenseflow-labs.ai"
            admin_name = "Labs Administrator"
            
            admin_user = db.query(User).filter_by(email=admin_email).first()
            if not admin_user:
                admin_user = User(
                    email=admin_email,
                    full_name=admin_name,
                    company_id=company.id,
                    is_active=True,
                    is_super_admin=False,
                    tags=["ADMIN", "FOUNDER"]
                )
                db.add(admin_user)
                db.flush()
                print(f"✅ Created Tenant Admin: {admin_email}")
            else:
                print(f"⚠️ Admin user {admin_email} already exists.")

            # 4. Generate Magic Link for this Admin
            token = secrets.token_urlsafe(32)
            # Use raw token or hash depending on how the verifier works, 
            # but model says Mapped[str] 'token'
            
            magic_link = MagicLinkToken(
                user_id=admin_user.id,
                token=token,
                expires_at=datetime.utcnow() + timedelta(hours=24)
            )
            db.add(magic_link)
            db.commit()
            
            login_url = f"http://localhost:3001/auth/magic-link/verify?token={token}"
            
            print("\n" + "="*50)
            print("🚀 PHASE 1 COMPLETE: TENANT BIRTHTED")
            print("="*50)
            print(f"Tenant: {company.name}")
            print(f"Admin:  {admin_user.full_name} ({admin_user.email})")
            print(f"\n🔗 ADMIN MAGIC LINK:")
            print(f"{login_url}")
            print("="*50)
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    create_first_tenant()
