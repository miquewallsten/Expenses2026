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

import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from apps.api.config import settings
from apps.api.deps import get_db
from packages.core.platform.models_user import User

_log = logging.getLogger(__name__)

_ENV    = settings.environment.lower().strip()
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
        payload = jwt.decode(token, _SECRET, algorithms=["HS256"])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
    return db.query(User).filter(User.id == user_id).first()


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
    if current_user.role not in ["manager", "accountant", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return current_user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def require_same_company(target_company_id: int, current_user: User) -> None:
    if current_user.company_id != target_company_id:
        raise HTTPException(status_code=403, detail="Cross-company access is not allowed")
