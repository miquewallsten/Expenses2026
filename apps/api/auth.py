"""auth.py — FastAPI dependency functions for authentication.

Authentication modes (checked in priority order):
  1. Bearer JWT  — issued by /auth/magic-link/verify
  2. X-User-Id header — DEV ONLY (disabled when ENVIRONMENT=production)

Magic link flow:
  POST /auth/magic-link/request  →  generates one-time token, emails or returns link
  GET  /auth/magic-link/verify   →  validates token, returns signed JWT
  Client stores JWT, sends as:   Authorization: Bearer <token>

JWT payload:  { sub, email, role, company_id, iat, exp }
"""

import logging
import os

import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from apps.api.config import settings
from apps.api.deps import get_db
from packages.core.platform.models_user import User

_log = logging.getLogger(__name__)

# Use settings.environment (loads .env via pydantic-settings) instead of os.environ
# This ensures dotenv is loaded before checking the environment variable
_ENV = settings.environment.lower().strip()
_SECRET = settings.auth_secret

_ALLOW_HEADER_AUTH = _ENV in ("development", "dev", "test", "testing")

if not _ALLOW_HEADER_AUTH:
    _log.warning(
        "auth: X-User-Id header auth is DISABLED (ENVIRONMENT=%r). "
        "All requests must use Bearer JWT.",
        _ENV,
    )


def _user_from_jwt(token: str, db: Session) -> User | None:
    try:
        payload = jwt.decode(token, _SECRET, algorithms=["HS256"], audience="financial-ops-platform")
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        # Verify is_super_admin matches JWT claim (prevents privilege escalation)
        jwt_is_super_admin = payload.get("is_super_admin", False)
        if jwt_is_super_admin and not user.is_super_admin:
            return None  # JWT claims super-admin but user lost the privilege
    return user


def get_current_user(
    authorization: str | None = Header(default=None),
    x_user_id: int | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    # 1. Bearer JWT — works in all environments
    if authorization and authorization.startswith("Bearer "):
        raw = authorization.removeprefix("Bearer ").strip()
        user = _user_from_jwt(raw, db)
        if user:
            return user
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # 2. X-User-Id header — dev only
    if _ALLOW_HEADER_AUTH and x_user_id is not None:
        user = db.query(User).filter(User.id == x_user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid user")
        return user

    raise HTTPException(
        status_code=401,
        detail="Authentication required. Use Bearer JWT from /auth/magic-link/verify.",
    )


def require_manager_or_accountant(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ["manager", "accounting", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return current_user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    """Platform operator gate. Cross-tenant — never granted to customer admins.
    Used for AI engine config, agent usage, insights digest, category memory,
    and any other surface that touches more than one company."""
    if not getattr(current_user, "is_super_admin", False):
        raise HTTPException(status_code=403, detail="Super admin access required")
    return current_user


def require_same_company(target_company_id: int, current_user: User) -> None:
    """Verify that current_user belongs to target_company_id.
    
    Super admins have company_id=None and should be exempt from this check.
    The explicit None check prevents two users with company_id=None from
    bypassing tenant isolation.
    """
    if current_user.company_id is None and target_company_id is None:
        # Two super-admins — both have None company_id — allow only if is_super_admin
        if not getattr(current_user, "is_super_admin", False):
            raise HTTPException(status_code=403, detail="Cross-company access is not allowed")
        return
    if current_user.company_id is None:
        # Super admin accessing a tenant — allowed
        if not getattr(current_user, "is_super_admin", False):
            raise HTTPException(status_code=403, detail="Cross-company access is not allowed")
        return
    if current_user.company_id != target_company_id:
        raise HTTPException(status_code=403, detail="Cross-company access is not allowed")
