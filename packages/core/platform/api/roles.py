from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.schemas_role import (
    RoleCreate,
    RoleRead,
    PermissionCreate,
    PermissionRead,
    RolePermissionCreate,
    UserRoleCreate,
)
from packages.core.platform.service_role import (
    assign_permission_to_role,
    assign_role_to_user,
    create_permission,
    create_role,
    get_permission_keys_for_user,
    list_permissions,
    list_roles,
)


class UserPermissionsResponse(BaseModel):
    user_id: int
    permission_keys: list[str]

router = APIRouter(prefix="/roles", tags=["roles"])


@router.post("/", response_model=RoleRead)
def create_role_route(data: RoleCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not getattr(current_user, "is_super_admin", False):
        require_same_company(data.company_id, current_user)
    try:
        return create_role(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=list[RoleRead])
def list_roles_route(company_id: int | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Non-super-admins can only see their own company's roles
    if not getattr(current_user, "is_super_admin", False):
        company_id = current_user.company_id
    return list_roles(db, company_id=company_id)


@router.post("/permissions", response_model=PermissionRead)
def create_permission_route(data: PermissionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Only admins can create permissions
    if current_user.role != "admin" and not getattr(current_user, "is_super_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        return create_permission(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/permissions", response_model=list[PermissionRead])
def list_permissions_route(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return list_permissions(db)


@router.post("/assign-permission")
def assign_permission_route(data: RolePermissionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin" and not getattr(current_user, "is_super_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        assign_permission_to_role(db, data)
        return {"status": "ok"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/assign-user-role")
def assign_user_role_route(data: UserRoleCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin" and not getattr(current_user, "is_super_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        assign_role_to_user(db, data)
        return {"status": "ok"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/user-permissions/{user_id}", response_model=UserPermissionsResponse)
def get_user_permissions_route(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    keys = get_permission_keys_for_user(db, user_id)
    return UserPermissionsResponse(user_id=user_id, permission_keys=keys)
