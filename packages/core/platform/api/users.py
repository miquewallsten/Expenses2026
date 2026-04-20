from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user
from apps.api.deps import get_db
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
def create_user_endpoint(payload: UserCreate, db: Session = Depends(get_db)):
    try:
        user = create_user(db, payload)
        return build_user_read(db, user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=list[UserRead])
def list_users_endpoint(company_id: int | None = None, db: Session = Depends(get_db)):
    users = list_users(db, company_id=company_id)
    return [build_user_read(db, u) for u in users]


@router.get("/{user_id}", response_model=UserRead)
def get_user_endpoint(user_id: int, db: Session = Depends(get_db)):
    user = get_user(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return build_user_read(db, user)


@router.patch("/{user_id}", response_model=UserRead)
def update_user_endpoint(user_id: int, payload: UserUpdate, db: Session = Depends(get_db)):
    user = update_user(db, user_id, payload.model_dump(exclude_none=True))
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return build_user_read(db, user)


@router.delete("/{user_id}")
def delete_user_endpoint(user_id: int, db: Session = Depends(get_db)):
    deleted = delete_user(db, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "deleted"}

