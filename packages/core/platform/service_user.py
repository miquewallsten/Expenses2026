from datetime import datetime, timezone
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.core.platform.models_user_project import UserProjectAssignment
from packages.core.platform.schemas_user import UserCreate


# ── Builder: converts ORM User + join data into a plain dict for UserRead ─────

def build_user_read(db: Session, user: User) -> dict:
    """Return a dict compatible with UserRead, including derived fields."""
    assignments = (
        db.query(UserProjectAssignment)
        .filter(UserProjectAssignment.user_id == user.id)
        .all()
    )
    boss_name = None
    if user.delegates_for_user_id:
        boss = db.query(User).filter(User.id == user.delegates_for_user_id).first()
        if boss:
            boss_name = boss.full_name
    return {
        "id": user.id,
        "company_id": user.company_id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "department": user.department,
        "job_title": user.job_title,
        "phone": user.phone,
        "legal_entity_id": user.legal_entity_id,
        "delegates_for_user_id": user.delegates_for_user_id,
        "delegates_for_user_name": boss_name,
        "can_create_expenses": user.can_create_expenses,
        "can_create_corporate_expenses": user.can_create_corporate_expenses,
        "can_invoice_corporation": user.can_invoice_corporation,
        "is_amex_reconciler": user.is_amex_reconciler,
        "requires_time_tracking": user.requires_time_tracking,
        "has_executive_reporting": user.has_executive_reporting,
        "invited_at": user.invited_at,
        "last_login_at": user.last_login_at,
        "created_at": user.created_at,
        "project_ids": [a.project_id for a in assignments],
    }


# ── CRUD ──────────────────────────────────────────────────────────────────────

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
        department=payload.department,
        job_title=payload.job_title,
        phone=payload.phone,
        legal_entity_id=payload.legal_entity_id,
        delegates_for_user_id=payload.delegates_for_user_id,
        can_create_expenses=payload.can_create_expenses,
        can_create_corporate_expenses=payload.can_create_corporate_expenses,
        can_invoice_corporation=payload.can_invoice_corporation,
        is_amex_reconciler=payload.is_amex_reconciler,
        requires_time_tracking=payload.requires_time_tracking,
        has_executive_reporting=payload.has_executive_reporting,
    )
    db.add(user)
    db.flush()  # get user.id before project assignments

    # Save project assignments
    for pid in payload.project_ids:
        db.add(UserProjectAssignment(user_id=user.id, project_id=pid))

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


# Fields that are safe to update via the API.  Sensitive fields like
# is_super_admin, password_hash, and company_id are intentionally excluded —
# they must go through dedicated endpoints with stricter auth checks.
_UPDATABLE_FIELDS: set[str] = {
    "full_name",
    "email",
    "role",
    "department",
    "job_title",
    "phone",
    "legal_entity_id",
    "delegates_for_user_id",
    "is_active",
    "can_create_expenses",
    "can_create_corporate_expenses",
    "can_invoice_corporation",
    "is_amex_reconciler",
    "requires_time_tracking",
    "has_executive_reporting",
}


def update_user(db: Session, user_id: int, payload: dict) -> User | None:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        return None

    project_ids = payload.pop("project_ids", None)

    for field, value in payload.items():
        if field not in _UPDATABLE_FIELDS:
            continue  # silently skip disallowed fields
        if hasattr(user, field) and value is not None:
            setattr(user, field, value)

    # Replace project assignments if provided
    if project_ids is not None:
        db.query(UserProjectAssignment).filter(UserProjectAssignment.user_id == user_id).delete()
        for pid in project_ids:
            db.add(UserProjectAssignment(user_id=user_id, project_id=pid))

    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user_id: int) -> bool:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        return False
    db.delete(user)
    db.commit()
    return True

