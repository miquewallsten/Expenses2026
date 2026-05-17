from apps.api.db import SessionLocal
from packages.core.platform.models_user import User, MagicLinkToken
from sqlalchemy import text

def get_link():
    db = SessionLocal()
    try:
        # Get the admin of Lola Corp
        user = db.query(User).filter(User.email.like('%lola%')).first()
        if not user:
            print("No admin user found for Lola Corp yet.")
            return
            
        token = db.query(MagicLinkToken).filter(User.id == user.id).order_by(MagicLinkToken.created_at.desc()).first()
        if token:
            print(f"MAGIC_LINK_TOKEN: {token.token}")
            print(f"DIRECT_LOGIN_URL: http://localhost:3001/auth/verify?token={token.token}")
        else:
            print("No token found for user.")
    finally:
        db.close()

if __name__ == "__main__":
    get_link()
