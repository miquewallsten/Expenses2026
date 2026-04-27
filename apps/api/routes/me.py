"""Phase 2.3 — current-user endpoints. Single read-only surface that the
frontend uses to drive feature visibility."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.service_permissions import list_permissions

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/permissions")
def me_permissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return the current user's permission keys and identity context.

    The frontend reads this once on session bootstrap and caches it. Each
    permission key is opaque to the client — UI just checks membership.
    """
    return {
        "user_id": current_user.id,
        "company_id": current_user.company_id,
        "role": current_user.role,
        "permissions": list_permissions(db, current_user),
    }
