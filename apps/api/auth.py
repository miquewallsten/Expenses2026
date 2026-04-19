"""auth.py — FastAPI dependency functions for authentication.

SECURITY NOTE — X-User-Id header auth is DEV-ONLY
---------------------------------------------------
The current authentication mechanism accepts a plain ``X-User-Id: <int>``
HTTP header.  This is **not production-safe**: any caller can impersonate any
user by setting the header.

This approach is intentionally kept for local development to avoid the
complexity of a full OAuth / JWT setup before the rest of the platform is
stable.  To ensure it cannot accidentally run in a non-dev environment, the
``get_current_user`` dependency checks ``ENVIRONMENT`` at startup and refuses
to serve requests in production mode.

When you add real authentication (JWT / OAuth2 / session cookie):
1. Replace the ``get_current_user`` body with your token-validation logic.
2. Remove the ``_ALLOW_HEADER_AUTH`` guard below.
3. Remove the ``X-User-Id`` header from the CORS ``allow_headers`` list in
   ``main.py`` if it is listed there.
"""

import os
import logging

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.core.platform.models_user import User

_log = logging.getLogger(__name__)

# Allow header-based auth only in development. Set ENVIRONMENT=production to
# disable it and force a real auth mechanism.
_ENV = os.environ.get("ENVIRONMENT", "development").lower().strip()
_ALLOW_HEADER_AUTH = _ENV in ("development", "dev", "test", "testing")

if not _ALLOW_HEADER_AUTH:
    _log.warning(
        "auth: X-User-Id header auth is DISABLED (ENVIRONMENT=%r). "
        "All authenticated endpoints will return 401 until real auth is implemented.",
        _ENV,
    )


def get_current_user(
    x_user_id: int | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not _ALLOW_HEADER_AUTH:
        raise HTTPException(
            status_code=401,
            detail=(
                "Header-based auth is not allowed in this environment. "
                "Implement real authentication before deploying to production."
            ),
        )

    if x_user_id is None:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header")

    user = db.query(User).filter(User.id == x_user_id).first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid user")

    return user


def require_manager_or_accountant(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ["manager", "accountant", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return current_user


def require_same_company(target_company_id: int, current_user: User) -> None:
    if current_user.company_id != target_company_id:
        raise HTTPException(status_code=403, detail="Cross-company access is not allowed")
