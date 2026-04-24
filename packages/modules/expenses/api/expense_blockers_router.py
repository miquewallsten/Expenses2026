from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.expenses.api._security import get_expense_for_user
from packages.modules.expenses.service.expense_blocker_service import get_expense_blockers

router = APIRouter(prefix="/expenses/blockers", tags=["expenses"])


# ── Developer smoke tests ──────────────────────────────────────────────────────
#
# See the module-level docstring in expense_blocker_service.py for a complete
# 6-step walkthrough.  Quick reference for this endpoint:
#
# Poll current blocker state for an expense (replace EXP with a real id):
#
#   curl -s "http://localhost:8000/expenses/blockers/$EXP" \
#     -H "X-User-Id: 1" | python3 -m json.tool
#
# Reading the response
# --------------------
# submit_blockers      — non-empty → employee cannot submit yet
# accounting_blockers  — non-empty → accounting team cannot approve/work
# poliza_blockers      — non-empty → póliza cannot be generated
# warnings             — non-empty → soft issues; no action blocked
#
# A fully clear expense looks like:
#   {"expense_id": N, "submit_blockers": [], "accounting_blockers": [],
#    "poliza_blockers": [], "warnings": []}
#
# 404 is returned when the expense_id does not exist.
# ───────────────────────────────────────────────────────────────────────────────


@router.get("/{expense_id}")
def get_expense_blockers_route(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expense = get_expense_for_user(expense_id, db, current_user)

    blockers = get_expense_blockers(db, expense)
    return {
        "expense_id":           expense_id,
        "submit_blockers":      blockers["submit_blockers"],
        "accounting_blockers":  blockers["accounting_blockers"],
        "poliza_blockers":      blockers["poliza_blockers"],
        "warnings":             blockers["warnings"],
    }
