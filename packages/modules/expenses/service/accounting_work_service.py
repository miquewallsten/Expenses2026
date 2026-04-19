"""accounting_work_service.py

Implements accounting-side work actions on individual expenses: account code
assignment and póliza generation.

Design notes
------------
* Account code assignment and clearing are gated on resolve_accounting_actions
  (action_resolver_service), which delegates reviewability to
  is_accounting_reviewable (review_queue_service) — the same helper used by
  the accounting queue.  This ensures the parity invariant: account code work
  is only permitted on expenses that appear in the accounting queue.

* Póliza generation is gated on can_generate_poliza_for_expense, which
  delegates entirely to get_expense_blockers (expense_blocker_service).  That
  service is the single source of truth for all póliza prerequisites:
  - poliza_required must be True for the company
  - expense must be in an accounting-reviewable state
  - account code must be present (when account_code_required=True)
  - allocation dimensions must be satisfied: project, client, and/or
    cost_center allocation rows must each have at least one persisted
    ExpenseAllocation row with a non-null value for the required dimension.
  Once all of these blockers are resolved, generate_poliza_for_expense returns
  the success payload without further local gating.

* Póliza generation is service-level only.  The existing Poliza DB table is
  keyed to report_id (not expense_id) and has no nullable report_id column, so
  persisting a per-expense Poliza record without a report is not supported by
  the current schema.  When a dedicated per-expense Poliza model is added,
  update generate_poliza_for_expense to create and return a persisted record.
"""

from sqlalchemy.orm import Session

from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.service.action_resolver_service import (
    resolve_accounting_actions,
)
from packages.modules.expenses.service.expense_blocker_service import (
    get_expense_blockers,
)
from packages.modules.expenses.service.accounting_learning_service import store_learning


# ── Account code ──────────────────────────────────────────────────────────────

def assign_account_code(
    db: Session,
    expense: Expense,
    account_code: str,
) -> Expense:
    """
    Assign *account_code* to *expense*.

    Rules:
    - The code is stripped of leading/trailing whitespace.
    - An empty code (after stripping) is rejected.
    - Only permitted when resolve_accounting_actions reports
      can_assign_account_code=True for this expense; any other state raises
      ValueError so the caller can surface a meaningful error.
    - Commits and refreshes the expense before returning.
    """
    code = (account_code or "").strip()
    if not code:
        raise ValueError("Account code must not be empty.")

    actions = resolve_accounting_actions(db, expense)
    if not actions["can_assign_account_code"]:
        reasons = "; ".join(actions["reasons"]) if actions["reasons"] else "no reason given"
        raise ValueError(
            f"Account code cannot be assigned to this expense: {reasons}"
        )

    expense.account_code = code
    db.commit()
    db.refresh(expense)
    store_learning(
        db,
        company_id=expense.company_id,
        input_text=expense.description,
        category_code=expense.category_code,
        account_code=expense.account_code,
        expense_status=expense.status,
    )
    return expense


def clear_account_code(db: Session, expense: Expense) -> Expense:
    """
    Remove the account code from *expense*.

    Only permitted when accounting work is currently allowed for this expense
    (same can_assign_account_code gate used by assign_account_code).
    Commits and refreshes before returning.
    """
    actions = resolve_accounting_actions(db, expense)
    if not actions["can_assign_account_code"]:
        reasons = "; ".join(actions["reasons"]) if actions["reasons"] else "no reason given"
        raise ValueError(
            f"Account code cannot be cleared for this expense: {reasons}"
        )

    expense.account_code = None
    db.commit()
    db.refresh(expense)
    return expense


# ── Póliza generation ─────────────────────────────────────────────────────────

def can_generate_poliza_for_expense(
    db: Session,
    expense: Expense,
) -> tuple[bool, list[str]]:
    """
    Return ``(True, [])`` when a póliza can be generated for *expense*, or
    ``(False, reasons)`` listing every blocking condition.

    All checks are fully delegated to get_expense_blockers so that póliza
    gate logic is not duplicated across the codebase.  Specifically, the
    following conditions must all be satisfied (checked in order):

    1. ``accounting_setup.poliza_required`` is True for the company.
    2. The expense is in an accounting-reviewable state.
    3. Account code is present (when ``account_code_required=True``).
    4. Each required allocation dimension has at least one persisted
       ``ExpenseAllocation`` row with a non-null value:
       - ``project_id``     when ``project_required=True``
       - ``client_id``      when ``client_required=True``
       - ``cost_center_id`` when ``cost_center_required=True``

    As soon as qualifying ``ExpenseAllocation`` rows are saved and the account
    code is assigned, ``poliza_blockers`` becomes empty and this function
    returns ``(True, [])``.
    """
    blockers = get_expense_blockers(db, expense)
    poliza_blockers = blockers["poliza_blockers"]
    if poliza_blockers:
        return False, poliza_blockers
    return True, []


def generate_poliza_for_expense(db: Session, expense: Expense) -> dict:
    """
    Generate a póliza record for *expense* and return a result payload.

    Gate: calls can_generate_poliza_for_expense, which delegates to
    get_expense_blockers.  Raises ValueError (→ HTTP 400) when any
    poliza_blocker is still active.  Returns the success payload as soon as
    all blockers are resolved — specifically once account code is assigned
    (when required) and qualifying ExpenseAllocation rows exist for every
    required dimension (project, client, cost center).

    Persistence note: the existing Poliza DB table is keyed to report_id and
    does not support per-expense records.  This function returns a service-level
    payload only.  When a PolizaExpense persistence model is added, update this
    function to create and return a persisted record instead.

    Returned payload:
      expense_id       int
      status           "generated"
      poliza_reference str   — "POL-EXP-<expense.id>"
      account_code     str | None
      amount           float
    """
    allowed, reasons = can_generate_poliza_for_expense(db, expense)
    if not allowed:
        formatted = "; ".join(reasons)
        raise ValueError(f"Póliza cannot be generated for this expense: {formatted}")

    return {
        "expense_id":       expense.id,
        "status":           "generated",
        "poliza_reference": f"POL-EXP-{expense.id}",
        "account_code":     expense.account_code,
        "amount":           expense.amount,
    }
