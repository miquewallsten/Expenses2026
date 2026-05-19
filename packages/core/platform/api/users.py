from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.schemas_user import UserCreate, UserRead, UserUpdate
from packages.core.platform.service_user import (
    build_user_read,
    create_user,
    delete_user,
    get_user,
    list_users,
    update_user,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
def get_me(current_user: UserRead = Depends(get_current_user)):
    return current_user


@router.post("/", response_model=UserRead)
def create_user_endpoint(payload: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Only super admins can create users in a different company
    if not getattr(current_user, "is_super_admin", False):
        require_same_company(payload.company_id, current_user)
    try:
        user = create_user(db, payload)
        return build_user_read(db, user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=list[UserRead])
def list_users_endpoint(company_id: int | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Non-super-admins can only list users in their own company
    if not getattr(current_user, "is_super_admin", False):
        company_id = current_user.company_id
    elif company_id is None:
        # Super admin with no filter: list all (their privilege)
        pass
    users = list_users(db, company_id=company_id)
    return [build_user_read(db, u) for u in users]


@router.get("/{user_id}", response_model=UserRead)
def get_user_endpoint(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = get_user(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    # Non-super-admins can only view users in their own company
    if not getattr(current_user, "is_super_admin", False):
        require_same_company(user.company_id, current_user)
    return build_user_read(db, user)


@router.patch("/{user_id}", response_model=UserRead)
def update_user_endpoint(user_id: int, payload: UserUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    target = get_user(db, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    # Non-super-admins can only update users in their own company
    if not getattr(current_user, "is_super_admin", False):
        require_same_company(target.company_id, current_user)
    user = update_user(db, user_id, payload.model_dump(exclude_none=True))
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return build_user_read(db, user)


@router.delete("/{user_id}")
def delete_user_endpoint(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Only super admins or same-company admins can delete users
    target = get_user(db, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if not getattr(current_user, "is_super_admin", False):
        require_same_company(target.company_id, current_user)
    deleted = delete_user(db, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "deleted"}

