"""Delegation service — manages approval delegation with date ranges."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from packages.core.platform.models_delegation import Delegation
from packages.core.platform.models_user import User

if TYPE_CHECKING:
    pass


def get_active_delegates(db: Session, company_id: int, principal_user_id: int) -> list[User]:
    """Return list of User objects who are currently active delegates for the principal.

    A delegation is active if:
      - is_active is True
      - start_date is None or <= today
      - end_date is None or >= today
    """
    today = date.today()
    rows = (
        db.query(Delegation)
        .filter(
            Delegation.company_id == company_id,
            Delegation.principal_user_id == principal_user_id,
            Delegation.is_active == True,  # noqa: E712
        )
        .all()
    )
    active_delegate_ids = []
    for d in rows:
        if d.start_date and d.start_date > today:
            continue
        if d.end_date and d.end_date < today:
            continue
        active_delegate_ids.append(d.delegate_user_id)

    if not active_delegate_ids:
        return []

    return (
        db.query(User)
        .filter(User.id.in_(active_delegate_ids), User.is_active == True)  # noqa: E712
        .all()
    )


def is_delegate_active(
    db: Session, company_id: int, delegate_user_id: int, principal_user_id: int
) -> bool:
    """Check if a specific delegation is currently active."""
    today = date.today()
    d = (
        db.query(Delegation)
        .filter(
            Delegation.company_id == company_id,
            Delegation.delegate_user_id == delegate_user_id,
            Delegation.principal_user_id == principal_user_id,
            Delegation.is_active == True,  # noqa: E712
        )
        .first()
    )
    if d is None:
        return False
    if d.start_date and d.start_date > today:
        return False
    if d.end_date and d.end_date < today:
        return False
    return True


def create_delegation(
    db: Session,
    company_id: int,
    delegate_user_id: int,
    principal_user_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
) -> Delegation:
    """Create a new delegation. Validates that both users belong to the company."""
    # Validate users exist and belong to the company
    for uid in (delegate_user_id, principal_user_id):
        user = db.query(User).filter(User.id == uid).first()
        if user is None:
            raise ValueError(f"User {uid} not found")
        if user.company_id != company_id:
            raise ValueError(f"User {uid} does not belong to company {company_id}")

    # Check for duplicate
    existing = (
        db.query(Delegation)
        .filter(
            Delegation.company_id == company_id,
            Delegation.delegate_user_id == delegate_user_id,
            Delegation.principal_user_id == principal_user_id,
            Delegation.is_active == True,  # noqa: E712
        )
        .first()
    )
    if existing:
        # Update dates instead of creating duplicate
        existing.start_date = start_date
        existing.end_date = end_date
        db.commit()
        db.refresh(existing)
        return existing

    delegation = Delegation(
        company_id=company_id,
        delegate_user_id=delegate_user_id,
        principal_user_id=principal_user_id,
        start_date=start_date,
        end_date=end_date,
    )
    db.add(delegation)
    db.commit()
    db.refresh(delegation)
    return delegation


def revoke_delegation(db: Session, delegation_id: int) -> bool:
    """Soft-revoke a delegation by setting is_active=False."""
    d = db.query(Delegation).filter(Delegation.id == delegation_id).first()
    if d is None:
        return False
    d.is_active = False
    db.commit()
    return True


def list_delegations_for_company(db: Session, company_id: int) -> list[Delegation]:
    """List all delegations for a company."""
    return (
        db.query(Delegation)
        .filter(Delegation.company_id == company_id)
        .order_by(Delegation.created_at.desc())
        .all()
    )


def list_my_principals(db: Session, company_id: int, delegate_user_id: int) -> list[Delegation]:
    """List all active delegations where the current user is a delegate."""
    today = date.today()
    return (
        db.query(Delegation)
        .filter(
            Delegation.company_id == company_id,
            Delegation.delegate_user_id == delegate_user_id,
            Delegation.is_active == True,  # noqa: E712
        )
        .all()
    )
