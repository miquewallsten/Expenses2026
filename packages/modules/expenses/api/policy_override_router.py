"""Employee justification overrides for failing policy checks.

Endpoints
---------
  GET    /expenses/{expense_id}/policy-overrides
  POST   /expenses/{expense_id}/policy-overrides     body {rule_code, note}
  DELETE /expenses/{expense_id}/policy-overrides/{rule_code}

Only the expense owner (or any authenticated user in dev) may override their
own expense.  The override is keyed by rule_code which must match a code
returned by compute_policy_checks.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.expenses.api._security import get_expense_for_user
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.expense_policy_override import (
    ExpensePolicyOverride,
)


router = APIRouter(prefix="/expenses", tags=["expenses"])


class OverrideCreate(BaseModel):
    rule_code: str = Field(..., min_length=1, max_length=100)
    note: str = Field(..., min_length=1, max_length=5000)


class OverrideRead(BaseModel):
    id: int
    rule_code: str
    justification_note: str
    created_at: str

    @classmethod
    def from_row(cls, r: ExpensePolicyOverride) -> "OverrideRead":
        return cls(
            id=r.id,
            rule_code=r.rule_code,
            justification_note=r.justification_note,
            created_at=r.created_at.isoformat(),
        )




@router.get("/{expense_id}/policy-overrides", response_model=list[OverrideRead])
def list_overrides(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_expense_for_user(expense_id, db, current_user)
    rows = (
        db.query(ExpensePolicyOverride)
        .filter(ExpensePolicyOverride.expense_id == expense_id)
        .order_by(ExpensePolicyOverride.created_at.asc())
        .all()
    )
    return [OverrideRead.from_row(r) for r in rows]


@router.post("/{expense_id}/policy-overrides", response_model=OverrideRead)
def create_or_update_override(
    expense_id: int,
    body: OverrideCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_expense_for_user(expense_id, db, current_user)
    note = body.note.strip()
    if not note:
        raise HTTPException(status_code=400, detail="Justification note cannot be empty.")

    existing = (
        db.query(ExpensePolicyOverride)
        .filter(
            ExpensePolicyOverride.expense_id == expense_id,
            ExpensePolicyOverride.rule_code == body.rule_code,
        )
        .first()
    )
    if existing is not None:
        existing.justification_note = note
        existing.created_by_user_id = current_user.id
        db.commit()
        db.refresh(existing)
        return OverrideRead.from_row(existing)

    row = ExpensePolicyOverride(
        expense_id=expense_id,
        rule_code=body.rule_code,
        justification_note=note,
        created_by_user_id=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return OverrideRead.from_row(row)


@router.delete("/{expense_id}/policy-overrides/{rule_code}")
def delete_override(
    expense_id: int,
    rule_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_expense_for_user(expense_id, db, current_user)
    row = (
        db.query(ExpensePolicyOverride)
        .filter(
            ExpensePolicyOverride.expense_id == expense_id,
            ExpensePolicyOverride.rule_code == rule_code,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Override not found.")
    db.delete(row)
    db.commit()
    return {"deleted": True}
