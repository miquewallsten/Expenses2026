"""accounting_event_service.py

Generates a structured accounting event for a submitted expense.

Design notes
------------
* An accounting event is NOT a póliza.  It is a lower-level building block
  that describes the debit/credit journal lines for a single expense.  Póliza
  generation (accounting_work_service) may consume this in the future.
* No DB persistence happens here.  The returned dict is a pure service-level
  payload that callers can inspect, log, or hand off to a posting layer.
* Account resolution follows a clear priority order — see
  _resolve_expense_account for details.
* Liability account is determined solely from settlement_type (see
  _SETTLEMENT_LIABILITY_MAP).  This keeps the mapping in one place.
* Allocation is optional but used when present.  When a category requires a
  project (requires_project=True) and no allocation row supplies a project_id,
  a ValueError is raised.

Returned event shape
--------------------
{
    "header": {
        "expense_id":  int,
        "company_id":  int,
        "amount":      float,
        "currency":    "MXN",
    },
    "lines": [
        {
            "type":       "debit",
            "account":    str,          # GL account code
            "amount":     float,
            "project_id": int | None,   # present on debit line when allocation exists
        },
        {
            "type":    "credit",
            "account": str,             # liability account key
            "amount":  float,
        },
    ],
    "metadata": {
        "settlement_type": str,
        "category_code":   str | None,
        "tax_behavior":    str | None,  # from category when available
    },
}
"""

from sqlalchemy.orm import Session

from packages.core.platform.models_accounting_category import AccountingCategory
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.expense_allocation import ExpenseAllocation
from packages.modules.admin.service.accounting_setup_service import (
    get_or_create_accounting_setup,
)

# ── Settlement type → liability account key ───────────────────────────────────

_SETTLEMENT_LIABILITY_MAP: dict[str, str] = {
    "reimbursable":   "employee_payable",
    "corporate_card": "card_clearing",
    "advance":        "employee_advance",
}

# Fallback when settlement_type is unrecognised or missing.
_DEFAULT_LIABILITY_ACCOUNT = "employee_payable"


# ── Internal helpers ──────────────────────────────────────────────────────────

def _load_expense(db: Session, expense_id: int) -> Expense:
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if expense is None:
        raise ValueError(f"Expense {expense_id} not found.")
    return expense


def _load_allocations(db: Session, expense_id: int) -> list[ExpenseAllocation]:
    return (
        db.query(ExpenseAllocation)
        .filter(ExpenseAllocation.expense_id == expense_id)
        .all()
    )


def _load_category(
    db: Session, company_id: int, category_code: str | None
) -> AccountingCategory | None:
    """Return the active AccountingCategory for *category_code*, or None."""
    if not category_code:
        return None
    return (
        db.query(AccountingCategory)
        .filter(
            AccountingCategory.company_id == company_id,
            AccountingCategory.code == category_code,
            AccountingCategory.is_active.is_(True),
        )
        .first()
    )


def _resolve_expense_account(
    expense: Expense,
    category: AccountingCategory | None,
) -> str:
    """Return the GL debit account for this expense.

    Priority:
    1. expense.account_code  — explicitly set by accounting staff
    2. category.expense_account_code — derived from category mapping
    3. Raises ValueError (caller has already validated that at least one exists)
    """
    if (expense.account_code or "").strip():
        return expense.account_code.strip()  # type: ignore[union-attr]
    if category and (category.expense_account_code or "").strip():
        return category.expense_account_code.strip()  # type: ignore[union-attr]
    # Should not reach here — _validate guards this.
    raise ValueError(
        "Missing accounting mapping (no account or category mapping found)."
    )


def _resolve_liability_account(settlement_type: str) -> str:
    """Return the GL credit account key for the given settlement type."""
    return _SETTLEMENT_LIABILITY_MAP.get(settlement_type, _DEFAULT_LIABILITY_ACCOUNT)


def _validate(
    expense: Expense,
    category: AccountingCategory | None,
) -> None:
    """Raise ValueError for any condition that must block event generation."""
    if expense.status != "approved":
        raise ValueError(
            f"Accounting event can only be generated for an approved expense "
            f"(current status: '{expense.status}')."
        )

    has_account_code = bool((expense.account_code or "").strip())
    has_category_account = category is not None and bool(
        (category.expense_account_code or "").strip()
    )
    if not has_account_code and not has_category_account:
        raise ValueError(
            "Missing accounting mapping (no account or category mapping found)."
        )


def _validate_allocation_for_category(
    category: AccountingCategory | None,
    allocations: list[ExpenseAllocation],
) -> None:
    """Raise ValueError when the category requires a project but none is found."""
    if category is None or not category.requires_project:
        return
    has_project = any(a.project_id is not None for a in allocations)
    if not has_project:
        raise ValueError(
            f"Category '{category.code}' requires a project allocation, but no "
            "ExpenseAllocation row with a non-null project_id exists for this expense."
        )


# ── Public entry point ────────────────────────────────────────────────────────

def generate_accounting_event(db: Session, expense_id: int) -> dict:
    """
    Build and return a structured accounting event dict for *expense_id*.

    Steps
    -----
    1. Load expense, allocations, accounting setup, and category config.
    2. Validate minimal requirements:
       - expense.status == "approved"
       - account_code present on expense OR active category has expense_account_code
    3. Resolve accounts:
       - expense (debit) account: explicit account_code > category.expense_account_code
       - liability (credit) account: derived from settlement_type
    4. Build debit line — includes project_id from the first allocation row that
       carries one (if any).
    5. If the category requires a project and none is supplied, raise ValueError.
    6. Return the event dict (not persisted).

    Raises
    ------
    ValueError — on any validation failure.  Callers should convert to HTTP 400.

    See module docstring for the full returned shape.
    """
    # ── 1. Load ───────────────────────────────────────────────────────────────
    expense     = _load_expense(db, expense_id)
    allocations = _load_allocations(db, expense_id)
    _           = get_or_create_accounting_setup(db, expense.company_id)  # side-effect: ensures row exists
    category    = _load_category(db, expense.company_id, expense.category_code)

    # ── 2. Validate ───────────────────────────────────────────────────────────
    _validate(expense, category)
    _validate_allocation_for_category(category, allocations)

    # ── 3. Resolve accounts ───────────────────────────────────────────────────
    expense_account   = _resolve_expense_account(expense, category)
    liability_account = _resolve_liability_account(expense.settlement_type or "reimbursable")

    # ── 4. Resolve project from allocations ───────────────────────────────────
    # Use the first allocation that carries a project_id; ignore others.
    project_id: int | None = next(
        (a.project_id for a in allocations if a.project_id is not None),
        None,
    )

    # ── 5. Build event ────────────────────────────────────────────────────────
    amount = expense.amount

    debit_line: dict = {
        "type":    "debit",
        "account": expense_account,
        "amount":  amount,
    }
    if project_id is not None:
        debit_line["project_id"] = project_id

    credit_line: dict = {
        "type":    "credit",
        "account": liability_account,
        "amount":  amount,
    }

    return {
        "header": {
            "expense_id": expense.id,
            "company_id": expense.company_id,
            "amount":     amount,
            "currency":   "MXN",
        },
        "lines": [debit_line, credit_line],
        "metadata": {
            "settlement_type": expense.settlement_type or "reimbursable",
            "category_code":   expense.category_code,
            "tax_behavior":    category.tax_behavior if category else None,
        },
    }
