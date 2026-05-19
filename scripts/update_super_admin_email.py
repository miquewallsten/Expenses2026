from apps.api.db import SessionLocal
from packages.core.platform.models_user import User
from packages.core.platform.password_utils import hash_password

def update_super_admin():
    db = SessionLocal()
    try:
        old_email = "superadmin@financial-ops.local"
        new_email = "superadmin@xpenseflow.ai"
        
        # Delete old if exists
        db.query(User).filter(User.email == old_email).delete()
        
        user = db.query(User).filter(User.email == new_email).first()
        
        if user:
            user.is_super_admin = True
            user.is_active = True
            user.password_hash = hash_password("admin123")
            print(f"Updated existing user {new_email}")
        else:
            new_user = User(
                email=new_email,
                full_name="Platform Super Administrator",
                role="admin",
                is_active=True,
                is_super_admin=True,
                password_hash=hash_password("admin123")
            )
            db.add(new_user)
            print(f"Created new super-admin: {new_email}")
            
        db.commit()
            
    except Exception as e:
        print(f"ERROR: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    update_super_admin()
