from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user
from apps.api.deps import get_db
from packages.core.platform.schemas_user import UserCreate, UserRead
from packages.core.platform.service_user import create_user, get_user, list_users

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
def get_me(current_user: UserRead = Depends(get_current_user)):
    return current_user


@router.post("/", response_model=UserRead)
def create_user_endpoint(payload: UserCreate, db: Session = Depends(get_db)):
    try:
        return create_user(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=list[UserRead])
def list_users_endpoint(company_id: int | None = None, db: Session = Depends(get_db)):
    return list_users(db, company_id=company_id)


@router.get("/{user_id}", response_model=UserRead)
def get_user_endpoint(user_id: int, db: Session = Depends(get_db)):
    user = get_user(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user
