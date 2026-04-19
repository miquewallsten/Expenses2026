from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.core.platform.schemas_user import UserCreate


def create_user(db: Session, payload: UserCreate) -> User:
    company = db.query(Company).filter(Company.id == payload.company_id).first()
    if not company:
        raise ValueError("Company not found")

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise ValueError("User with this email already exists")

    user = User(
        company_id=payload.company_id,
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role if payload.role is not None else "employee",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def list_users(db: Session, company_id: int | None = None) -> list[User]:
    query = db.query(User)

    if company_id is not None:
        query = query.filter(User.company_id == company_id)

    return query.all()


def get_user(db: Session, user_id: int) -> User | None:
    return db.query(User).filter(User.id == user_id).first()
