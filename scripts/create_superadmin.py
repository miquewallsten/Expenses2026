#!/usr/bin/env python3
"""
Create Super Admin user with password authentication.
"""

import sys
import os

sys.path.append(".")

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy.orm import Session
import getpass
import warnings

warnings.filterwarnings("ignore", category=UserWarning)


def create_super_admin():
    """Create a Super Admin user with password authentication."""

    # Use project settings to get the correct database URL
    from apps.api.db import engine

    try:
        with Session(engine) as db:
            # Import models
            from packages.core.platform.models_user import User
            from packages.core.platform.password_utils import hash_password

            email = os.getenv("SUPER_ADMIN_EMAIL", "superadmin@platform.local")

            # Check if super admin already exists
            existing = db.query(User).filter(User.email == email).first()

            if existing:
                print(f"Super Admin already exists: {existing.email}")
                if not existing.is_super_admin:
                    existing.is_super_admin = True
                    print("Updated is_super_admin=True")
                if not existing.password_hash:
                    password = getpass.getpass("Enter password for super admin: ")
                    if len(password) < 12:
                        print("Password must be at least 12 characters")
                        return False
                    existing.password_hash = hash_password(password)
                    print("Password set")
                db.commit()
                print(f"User ID: {existing.id}")
                return True

            # Prompt for password
            password = getpass.getpass("Enter password for super admin: ")
            if len(password) < 12:
                print("Password must be at least 12 characters")
                return False

            confirm = getpass.getpass("Confirm password: ")
            if password != confirm:
                print("Passwords do not match")
                return False

            # Create super-admin without company association
            super_admin = User(
                email=email,
                full_name="Platform Administrator",
                company_id=None,  # No company for super-admin
                is_active=True,
                is_super_admin=True,
                role="admin",
                password_hash=hash_password(password),
            )

            db.add(super_admin)
            db.commit()
            db.refresh(super_admin)

            print("")
            print("Super Admin created successfully!")
            print(f"  Email: {super_admin.email}")
            print(f"  User ID: {super_admin.id}")
            print("")
            print("Access the super-admin portal at: /super-admin/login")
            return True

    except Exception as e:
        print(f"Error creating Super Admin: {e}")
        import traceback

        traceback.print_exc()
        return False


if __name__ == "__main__":
    print("Creating Super Admin User")
    print("=" * 50)
    success = create_super_admin()
    sys.exit(0 if success else 1)