"""Access profile API — returns the resolved access profile for a user.

Called at login and on capability refresh. Uses the access resolution service
to compute capabilities, permissions, and module state.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.service_access import resolve_user_access, sync_role_capabilities


class AccessProfileResponse(BaseModel):
    user_id: int
    company_id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    is_super_admin: bool
    capabilities: dict[str, bool]
    permission_keys: list[str]
    enabled_modules: list[str]
    auto_corrected: dict[str, str]
    delegates_for_user_id: int | None
    delegates_for_user_name: str | None


class SyncRoleCapabilitiesResponse(BaseModel):
    user_id: int
    changed: list[str]


router = APIRouter(prefix="/access", tags=["access"])


@router.get("/{user_id}/profile", response_model=AccessProfileResponse)
def get_access_profile(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the resolved access profile for a user.

    Computes capabilities (with module cross-check), permissions from RBAC,
    and enabled modules. Auto-corrects stale capabilities (e.g. is_amex_reconciler
    when the Amex module is disabled).
    """
    # Users can only access their own profile unless they're admin/super_admin
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        # Return empty profile for unknown users
        return AccessProfileResponse(
            user_id=user_id,
            company_id=0,
            email="",
            full_name="",
            role="",
            is_active=False,
            is_super_admin=False,
            capabilities={},
            permission_keys=[],
            enabled_modules=[],
            auto_corrected={},
            delegates_for_user_id=None,
            delegates_for_user_name=None,
        )

    is_self = current_user.id == user_id
    is_admin = current_user.role in ("admin", "super_admin") or getattr(current_user, "is_super_admin", False)
    same_company = target.company_id == current_user.company_id

    if not (is_self or (is_admin and same_company)):
        # Return empty profile for unauthorized access
        return AccessProfileResponse(
            user_id=user_id,
            company_id=0,
            email="",
            full_name="",
            role="",
            is_active=False,
            is_super_admin=False,
            capabilities={},
            permission_keys=[],
            enabled_modules=[],
            auto_corrected={},
            delegates_for_user_id=None,
            delegates_for_user_name=None,
        )

    profile = resolve_user_access(db, target, sync_to_db=True)

    return AccessProfileResponse(
        user_id=profile.user_id,
        company_id=profile.company_id,
        email=profile.email,
        full_name=profile.full_name,
        role=profile.role,
        is_active=profile.is_active,
        is_super_admin=profile.is_super_admin,
        capabilities=profile.capabilities,
        permission_keys=profile.permission_keys,
        enabled_modules=profile.enabled_modules,
        auto_corrected=profile.auto_corrected,
        delegates_for_user_id=profile.delegates_for_user_id,
        delegates_for_user_name=profile.delegates_for_user_name,
    )


@router.post("/{user_id}/sync-role", response_model=SyncRoleCapabilitiesResponse)
def sync_role_capabilities_endpoint(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sync a user's capabilities with their current role's defaults.

    Admin-only endpoint. Called when a user's role changes to auto-sync
    capability flags with the new role.
    """
    if current_user.role not in ("admin", "super_admin") and not getattr(current_user, "is_super_admin", False):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin access required")

    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")

    if target.company_id != current_user.company_id and not getattr(current_user, "is_super_admin", False):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Cannot access other company's users")

    changed = sync_role_capabilities(db, target)

    return SyncRoleCapabilitiesResponse(
        user_id=target.id,
        changed=changed,
    )
