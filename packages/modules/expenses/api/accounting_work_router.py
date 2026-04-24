from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.auth import require_manager_or_accountant
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.expenses.api._security import get_expense_for_user
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.schemas.accounting_work import AssignAccountCodeRequest
from packages.modules.expenses.schemas.expense import ExpenseRead
from packages.modules.accounting.service.accounting_event_service import (
    generate_accounting_event,
)
from packages.modules.expenses.service.accounting_work_service import (
    assign_account_code,
    clear_account_code,
)
from packages.modules.expenses.service.accounting_learning_service import store_learning

router = APIRouter(prefix="/accounting/work", tags=["accounting"])


# ── Developer smoke tests ──────────────────────────────────────────────────────
#
# Prerequisites
# -------------
# * API running on http://localhost:8000
# * An expense in a state where accounting review is active (e.g. status
#   "submitted" or "manager_approved" for a company whose accounting flow is
#   enabled).  Replace EXPENSE_ID with a real id from the accounting queue.
#
# 1. Assign an account code
# -------------------------
# Expect: 200 with updated ExpenseRead; expense.account_code = "1010-gastos"
#
#   curl -s -X POST http://localhost:8000/accounting/work/EXPENSE_ID/assign-account-code \
#     -H "Content-Type: application/json" \
#     -H "X-User-Id: 1" \
#     -d '{"account_code": "1010-gastos"}' | python3 -m json.tool
#
# 2. Clear the account code
# -------------------------
# Expect: 200 with updated ExpenseRead; expense.account_code = null
#
#   curl -s -X POST http://localhost:8000/accounting/work/EXPENSE_ID/clear-account-code \
#     -H "X-User-Id: 1" | python3 -m json.tool
#
# 3. Generate accounting event
# -----------------------------
# Precondition: expense.status == "submitted"; account_code or active category
#               with expense_account_code is set.
# Expect: 200 with {header: {...}, lines: [...], metadata: {...}}
#
#   # Assign a code first if needed:
#   curl -s -X POST http://localhost:8000/accounting/work/EXPENSE_ID/assign-account-code \
#     -H "Content-Type: application/json" -H "X-User-Id: 1" \
#     -d '{"account_code": "1010-gastos"}' > /dev/null
#
#   curl -s -X POST http://localhost:8000/accounting/work/EXPENSE_ID/generate-event \
#     -H "X-User-Id: 1" | python3 -m json.tool
#
# ─────────────────────────────────────────────────────────────────────────────


# ── Shared helpers ─────────────────────────────────────────────────────────────

# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/{expense_id}/assign-account-code", response_model=ExpenseRead)
def assign_account_code_route(
    expense_id: int,
    body: AssignAccountCodeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_accountant),
):
    expense = get_expense_for_user(expense_id, db, current_user)
    try:
        updated = assign_account_code(db, expense, body.account_code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ExpenseRead.model_validate(updated)


@router.post("/{expense_id}/clear-account-code", response_model=ExpenseRead)
def clear_account_code_route(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_accountant),
):
    expense = get_expense_for_user(expense_id, db, current_user)
    try:
        updated = clear_account_code(db, expense)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ExpenseRead.model_validate(updated)


@router.post("/{expense_id}/generate-event")
def generate_event_route(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_accountant),
):
    expense = get_expense_for_user(expense_id, db, current_user)
    try:
        result = generate_accounting_event(db, expense_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    # Reload to pick up any state set during event generation, then record signal.
    db.refresh(expense)
    store_learning(
        db,
        company_id=expense.company_id,
        input_text=expense.description,
        category_code=expense.category_code,
        account_code=expense.account_code,
        expense_status=expense.status,
    )
    return result
