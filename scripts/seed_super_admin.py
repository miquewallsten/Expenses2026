from apps.api.db import SessionLocal
from packages.core.platform.models_user import User
from packages.core.platform.password_utils import hash_password

def main():
    db = SessionLocal()
    try:
        email = "superadmin@xpenseflow.ai"
        # Delete any existing invalid super-admin accounts
        invalid_emails = ["superadmin@financial-ops.local"]
        for invalid_email in invalid_emails:
            existing_invalid = db.query(User).filter(User.email == invalid_email).first()
            if existing_invalid:
                db.delete(existing_invalid)
                db.commit()
                print(f"Deleted invalid super-admin: {invalid_email}")
        
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            print(f"Super-admin {email} already exists (and is valid).")
            return

        user = User(
            email=email,
            full_name="Platform Super Administrator",
            role="admin", # 'admin' role, then the boolean flag makes it super-admin
            is_active=True,
            is_super_admin=True,
            password_hash=hash_password("admin123")
        )
        db.add(user)
        db.commit()
        print(f"(backend) Created valid super-admin: {email} / admin123")
    finally:
        db.close()

if __name__ == "__main__":
    main()
