#!/usr/bin/env python3
"""
Create Super Admin user for immediate access to the Financial Ops platform
"""

import sys
import os
sys.path.append('.')

from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
import warnings

# Suppress SQLAlchemy warnings
warnings.filterwarnings("ignore", category=UserWarning)

def create_super_admin():
    """Create a Super Admin user with full system access"""
    
    # Get database URL from environment or use default
    database_url = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/financial_ops')
    
    try:
        # Create engine and session
        engine = create_engine(database_url)
        
        with Session(engine) as db:
            # Check if users table exists
            table_exists = engine.dialect.has_table(engine.connect(), 'users')
            if not table_exists:
                print("❌ Users table doesn't exist. Please run migrations first:")
                print("   alembic upgrade head")
                return False
            
            # Check if company table exists and create default company
            company_exists = engine.dialect.has_table(engine.connect(), 'companies')
            if not company_exists:
                print("❌ Companies table doesn't exist. Please run migrations first:")
                print("   alembic upgrade head")
                return False
            
            # Import models after verifying tables exist
            from packages.core.platform.models import User, Company
            
            # Find or create default company
            company = db.query(Company).first()
            if not company:
                company = Company(
                    name='Default Company', 
                    slug='default',
                    timezone='America/Mexico_City',
                    currency='MXN'
                )
                db.add(company)
                db.commit()
                db.refresh(company)
                print(f"✅ Created default company: {company.name}")
            
            # Check if super admin already exists
            existing_admin = db.query(User).filter_by(email='superadmin@company.com').first()
            if existing_admin:
                print(f"✅ Super Admin already exists:")
                print(f"   Email: {existing_admin.email}")
                print(f"   Name: {existing_admin.full_name}")
                print(f"   User ID: {existing_admin.id}")
                return True
            
            # Create Super Admin user
            super_admin = User(
                email='superadmin@company.com',
                full_name='Super Administrator',
                company_id=company.id,
                is_active=True,
                is_superuser=True,
                can_manage_agents=True,
                can_configure_system=True,
                can_view_audit_logs=True,
                can_manage_users=True,
                requires_magic_link=False  # For immediate access
            )
            
            db.add(super_admin)
            db.commit()
            db.refresh(super_admin)
            
            print(f"✅ Super Admin user created successfully!")
            print(f"   Email: {super_admin.email}")
            print(f"   Name: {super_admin.full_name}")
            print(f"   Company: {company.name}")
            print(f"   User ID: {super_admin.id}")
            print("")
            print("🚀 LOGIN CREDENTIALS:")
            print("   Email: superadmin@company.com")
            print("   (No password needed - uses magic link system)")
            print("")
            print("🌐 Access the web interface at: http://localhost:3001")
            print("   You'll be redirected to login, then can access Super Admin features")
            
            return True
            
    except OperationalError as e:
        print(f"❌ Database connection failed: {e}")
        print("")
        print("💡 TROUBLESHOOTING:")
        print("1. Make sure PostgreSQL is running")
        print("2. Check DATABASE_URL environment variable")
        print("3. Run migrations: alembic upgrade head")
        return False
    except Exception as e:
        print(f"❌ Error creating Super Admin: {e}")
        return False

if __name__ == "__main__":
    print("🔧 CREATING SUPER ADMIN USER")
    print("=" * 50)
    success = create_super_admin()
    
    if not success:
        print("")
        print("🎯 ALTERNATIVE ACCESS:")
        print("   Use the command line interface instead:")
        print("   ./quick_admin status")
        print("   ./quick_admin skills")
        print("   ./quick_admin test")
        print("")
        print("   Or use direct agent commands:")
        print("   /financial-ops-superadmin system-health")
        print("   /expense-agent check-policy {\"amount\": 5000, \"category\": \"equipment\"}")

    print("")
    print("📖 See QUICK_ACCESS_GUIDE.md for complete usage instructions")