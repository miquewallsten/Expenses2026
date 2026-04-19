"""allocation_upsert_service.py

Provides replace-style allocation editing for an expense.

The single public function, replace_expense_allocations, atomically removes all
existing ExpenseAllocation rows for an expense and inserts a new set in their
place.  Validation is done before any write:

* Each row must carry a positive percent value.
* When multiple rows are supplied, their percent values must sum to 100.0
  (within a small floating-point tolerance of 0.01).
* If the company's expense policy has allow_split_allocations=False, only a
  single allocation row is accepted.
"""

from sqlalchemy.orm import Session

from packages.modules.expenses.models.expense_allocation import ExpenseAllocation
from packages.modules.expenses.service.expense_service import get_expense
from packages.modules.expenses.service.policy_service import (
    get_or_create_company_expense_policy,
)

_PERCENT_SUM_TOLERANCE = 0.01


def replace_expense_allocations(
    db: Session, expense_id: int, items: list[dict]
) -> list[ExpenseAllocation]:
    """Replace all allocation rows for *expense_id* with *items*.

    Each dict in *items* may contain:
        project_id      int | None
        client_id       int | None
        cost_center_id  int | None
        percent         float  (required, > 0)

    Raises ValueError on any of:
    - expense not found
    - empty items list
    - any row with a non-positive percent
    - multiple rows when allow_split_allocations is False
    - total percent not equal to 100.0 (within tolerance) for multiple rows
    """
    # ── Expense lookup ────────────────────────────────────────────────────────
    expense = get_expense(db, expense_id)
    if expense is None:
        raise ValueError(f"Expense {expense_id} not found.")

    if not items:
        raise ValueError("At least one allocation item is required.")

    # ── Per-row validation ────────────────────────────────────────────────────
    for idx, item in enumerate(items):
        percent = item.get("percent")
        if percent is None:
            raise ValueError(f"Item {idx}: 'percent' is required.")
        try:
            percent = float(percent)
        except (TypeError, ValueError):
            raise ValueError(f"Item {idx}: 'percent' must be numeric, got {percent!r}.")
        if percent <= 0:
            raise ValueError(
                f"Item {idx}: 'percent' must be greater than 0, got {percent}."
            )

    # ── Split-allocation policy check ─────────────────────────────────────────
    if len(items) > 1:
        policy = get_or_create_company_expense_policy(db, expense.company_id)
        if not bool(policy.allow_split_allocations):
            raise ValueError(
                "Split allocations are not allowed for this company "
                "(expense_policy.allow_split_allocations is False). "
                "Provide a single allocation row."
            )

        total = sum(float(item["percent"]) for item in items)
        if abs(total - 100.0) > _PERCENT_SUM_TOLERANCE:
            raise ValueError(
                f"Allocation percentages must sum to 100.0 when multiple rows are "
                f"provided, but the total is {total:.4f}."
            )

    # ── Atomic replace ────────────────────────────────────────────────────────
    db.query(ExpenseAllocation).filter(
        ExpenseAllocation.expense_id == expense_id
    ).delete(synchronize_session=False)

    created: list[ExpenseAllocation] = []
    for item in items:
        row = ExpenseAllocation(
            expense_id=expense_id,
            project_id=item.get("project_id"),
            client_id=item.get("client_id"),
            cost_center_id=item.get("cost_center_id"),
            percent=float(item["percent"]),
        )
        db.add(row)
        created.append(row)

    db.commit()
    for row in created:
        db.refresh(row)

    return created
