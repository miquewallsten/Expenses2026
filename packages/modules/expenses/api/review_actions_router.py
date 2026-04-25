from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_manager_or_accountant
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.service_idempotency import (
    IdempotencyKey,
    idempotency_lookup,
    idempotency_store,
)
from packages.modules.expenses.api._security import get_expense_for_user
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.schemas.expense import ExpenseRead
from packages.modules.expenses.service.transition_service import (
    submit_expense,
    manager_approve_expense,
    manager_reject_expense,
    manager_return_expense,
    accounting_approve_expense,
    accounting_reject_expense,
    accounting_return_expense,
)

router = APIRouter(prefix="/expenses/review-actions", tags=["expenses"])


def _run(
    fn,
    db: Session,
    expense: Expense,
    *,
    actor_user_id: int | None,
    route: str,
    idempotency_key: str | None,
) -> dict:
    """Idempotent transition wrapper. Returns a JSON-ready dict so the cache
    holds exactly what FastAPI sends back."""
    cached = idempotency_lookup(db, actor_user_id or 0, route, idempotency_key)
    if cached is not None:
        return cached
    try:
        updated = fn(db, expense, actor_user_id=actor_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    payload = ExpenseRead.model_validate(updated).model_dump(mode="json")
    idempotency_store(db, actor_user_id or 0, route, idempotency_key, payload)
    return payload


@router.post("/{expense_id}/submit", response_model=ExpenseRead)
def submit(
    expense_id: int,
    idem: IdempotencyKey = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expense = get_expense_for_user(expense_id, db, current_user)
    return _run(
        submit_expense,
        db,
        expense,
        actor_user_id=current_user.id,
        route="POST /expenses/review-actions/submit",
        idempotency_key=idem,
    )


@router.post("/{expense_id}/manager-approve", response_model=ExpenseRead)
def manager_approve(
    expense_id: int,
    idem: IdempotencyKey = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_accountant),
):
    expense = get_expense_for_user(expense_id, db, current_user)
    return _run(
        manager_approve_expense,
        db,
        expense,
        actor_user_id=current_user.id,
        route="POST /expenses/review-actions/manager-approve",
        idempotency_key=idem,
    )


@router.post("/{expense_id}/manager-reject", response_model=ExpenseRead)
def manager_reject(
    expense_id: int,
    idem: IdempotencyKey = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_accountant),
):
    expense = get_expense_for_user(expense_id, db, current_user)
    return _run(
        manager_reject_expense,
        db,
        expense,
        actor_user_id=current_user.id,
        route="POST /expenses/review-actions/manager-reject",
        idempotency_key=idem,
    )


@router.post("/{expense_id}/manager-return", response_model=ExpenseRead)
def manager_return(
    expense_id: int,
    idem: IdempotencyKey = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_accountant),
):
    expense = get_expense_for_user(expense_id, db, current_user)
    return _run(
        manager_return_expense,
        db,
        expense,
        actor_user_id=current_user.id,
        route="POST /expenses/review-actions/manager-return",
        idempotency_key=idem,
    )


@router.post("/{expense_id}/accounting-approve", response_model=ExpenseRead)
def accounting_approve(
    expense_id: int,
    idem: IdempotencyKey = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_accountant),
):
    expense = get_expense_for_user(expense_id, db, current_user)
    return _run(
        accounting_approve_expense,
        db,
        expense,
        actor_user_id=current_user.id,
        route="POST /expenses/review-actions/accounting-approve",
        idempotency_key=idem,
    )


@router.post("/{expense_id}/accounting-reject", response_model=ExpenseRead)
def accounting_reject(
    expense_id: int,
    idem: IdempotencyKey = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_accountant),
):
    expense = get_expense_for_user(expense_id, db, current_user)
    return _run(
        accounting_reject_expense,
        db,
        expense,
        actor_user_id=current_user.id,
        route="POST /expenses/review-actions/accounting-reject",
        idempotency_key=idem,
    )


@router.post("/{expense_id}/accounting-return", response_model=ExpenseRead)
def accounting_return(
    expense_id: int,
    idem: IdempotencyKey = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_accountant),
):
    expense = get_expense_for_user(expense_id, db, current_user)
    return _run(
        accounting_return_expense,
        db,
        expense,
        actor_user_id=current_user.id,
        route="POST /expenses/review-actions/accounting-return",
        idempotency_key=idem,
    )
