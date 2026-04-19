from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_manager_or_accountant
from apps.api.deps import get_db
from packages.core.platform.models_user import User
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


def _get_expense_or_404(expense_id: int, db: Session) -> Expense:
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if expense is None:
        raise HTTPException(status_code=404, detail=f"Expense {expense_id} not found.")
    return expense


def _transition(fn, db: Session, expense: Expense, actor_user_id: int | None) -> ExpenseRead:
    try:
        updated = fn(db, expense, actor_user_id=actor_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ExpenseRead.model_validate(updated)


@router.post("/{expense_id}/submit", response_model=ExpenseRead)
def submit(expense_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    expense = _get_expense_or_404(expense_id, db)
    return _transition(submit_expense, db, expense, actor_user_id=current_user.id)


@router.post("/{expense_id}/manager-approve", response_model=ExpenseRead)
def manager_approve(expense_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_accountant)):
    expense = _get_expense_or_404(expense_id, db)
    return _transition(manager_approve_expense, db, expense, actor_user_id=current_user.id)


@router.post("/{expense_id}/manager-reject", response_model=ExpenseRead)
def manager_reject(expense_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_accountant)):
    expense = _get_expense_or_404(expense_id, db)
    return _transition(manager_reject_expense, db, expense, actor_user_id=current_user.id)


@router.post("/{expense_id}/manager-return", response_model=ExpenseRead)
def manager_return(expense_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_accountant)):
    expense = _get_expense_or_404(expense_id, db)
    return _transition(manager_return_expense, db, expense, actor_user_id=current_user.id)


@router.post("/{expense_id}/accounting-approve", response_model=ExpenseRead)
def accounting_approve(expense_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_accountant)):
    expense = _get_expense_or_404(expense_id, db)
    return _transition(accounting_approve_expense, db, expense, actor_user_id=current_user.id)


@router.post("/{expense_id}/accounting-reject", response_model=ExpenseRead)
def accounting_reject(expense_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_accountant)):
    expense = _get_expense_or_404(expense_id, db)
    return _transition(accounting_reject_expense, db, expense, actor_user_id=current_user.id)


@router.post("/{expense_id}/accounting-return", response_model=ExpenseRead)
def accounting_return(expense_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_accountant)):
    expense = _get_expense_or_404(expense_id, db)
    return _transition(accounting_return_expense, db, expense, actor_user_id=current_user.id)
