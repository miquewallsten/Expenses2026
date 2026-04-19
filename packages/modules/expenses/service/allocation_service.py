from typing import List

from sqlalchemy.orm import Session

from packages.modules.expenses.models.expense_allocation import ExpenseAllocation
from packages.modules.expenses.schemas.expense_allocation import ExpenseAllocationCreate


def create_expense_allocation(db: Session, payload: ExpenseAllocationCreate) -> ExpenseAllocation:
    allocation = ExpenseAllocation(
        expense_id=payload.expense_id,
        project_id=payload.project_id,
        client_id=payload.client_id,
        cost_center_id=payload.cost_center_id,
        percent=payload.percent,
    )
    db.add(allocation)
    db.commit()
    db.refresh(allocation)
    return allocation


def list_expense_allocations(db: Session, expense_id: int) -> List[ExpenseAllocation]:
    return (
        db.query(ExpenseAllocation)
        .filter(ExpenseAllocation.expense_id == expense_id)
        .order_by(ExpenseAllocation.id)
        .all()
    )
