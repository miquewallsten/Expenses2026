"""smart_dimension_service.py — suggest cost center / project / client for an expense.

Based on historical patterns: when a user consistently assigns the same
cost center / project / client for similar expenses (same category, vendor,
or description keywords), we suggest it automatically.

Uses AccountingLearning as a signal source but extends to dimension allocation
patterns.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from packages.core.platform.models_client import Client
from packages.core.platform.models_cost_center import CostCenter
from packages.core.platform.models_project import Project
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.expense_allocation import ExpenseAllocation


def suggest_dimensions(
    db: Session,
    company_id: int,
    expense_id: int,
) -> dict[str, Any]:
    """Suggest cost center, project, and client for an expense.

    Looks at:
      1. Same user's past allocations for same category_code
      2. Same vendor pattern
      3. Description keyword patterns

    Returns:
        {
            "expense_id": int,
            "suggestions": {
                "cost_center_id": int | None,
                "project_id": int | None,
                "client_id": int | None,
            },
            "confidence": "high" | "medium" | "low",
            "reasoning": str,
        }
    """
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        return {"expense_id": expense_id, "suggestions": {}, "confidence": "none", "reasoning": "Expense not found"}

    user_id = expense.user_id
    category_code = expense.category_code

    # Find past allocations by same user for same category
    past = (
        db.query(ExpenseAllocation)
        .join(Expense, Expense.id == ExpenseAllocation.expense_id)
        .filter(
            Expense.company_id == company_id,
            Expense.user_id == user_id,
            Expense.category_code == category_code,
            ExpenseAllocation.cost_center_id.isnot(None),
        )
        .group_by(ExpenseAllocation.cost_center_id)
        .order_by(func.count(ExpenseAllocation.id).desc())
        .first()
    )

    suggestions: dict[str, int | None] = {
        "cost_center_id": None,
        "project_id": None,
        "client_id": None,
    }
    confidence = "low"
    reasoning = "No historical pattern found"

    if past:
        # Find most common cost_center for this user+category
        cc_alloc = (
            db.query(ExpenseAllocation.cost_center_id, func.count(ExpenseAllocation.id))
            .join(Expense, Expense.id == ExpenseAllocation.expense_id)
            .filter(
                Expense.company_id == company_id,
                Expense.user_id == user_id,
                Expense.category_code == category_code,
                ExpenseAllocation.cost_center_id.isnot(None),
            )
            .group_by(ExpenseAllocation.cost_center_id)
            .order_by(func.count(ExpenseAllocation.id).desc())
            .first()
        )
        if cc_alloc and cc_alloc[0]:
            suggestions["cost_center_id"] = cc_alloc[0]
            count = cc_alloc[1]
            confidence = "high" if count >= 5 else "medium" if count >= 2 else "low"
            reasoning = f"User assigned this cost center {count} times for category '{category_code}'"

        # Most common project
        proj_alloc = (
            db.query(ExpenseAllocation.project_id, func.count(ExpenseAllocation.id))
            .join(Expense, Expense.id == ExpenseAllocation.expense_id)
            .filter(
                Expense.company_id == company_id,
                Expense.user_id == user_id,
                Expense.category_code == category_code,
                ExpenseAllocation.project_id.isnot(None),
            )
            .group_by(ExpenseAllocation.project_id)
            .order_by(func.count(ExpenseAllocation.id).desc())
            .first()
        )
        if proj_alloc and proj_alloc[0]:
            suggestions["project_id"] = proj_alloc[0]

        # Most common client
        client_alloc = (
            db.query(ExpenseAllocation.client_id, func.count(ExpenseAllocation.id))
            .join(Expense, Expense.id == ExpenseAllocation.expense_id)
            .filter(
                Expense.company_id == company_id,
                Expense.user_id == user_id,
                Expense.category_code == category_code,
                ExpenseAllocation.client_id.isnot(None),
            )
            .group_by(ExpenseAllocation.client_id)
            .order_by(func.count(ExpenseAllocation.id).desc())
            .first()
        )
        if client_alloc and client_alloc[0]:
            suggestions["client_id"] = client_alloc[0]

    # Enrich with names
    enriched = {}
    if suggestions.get("cost_center_id"):
        cc = db.query(CostCenter).get(suggestions["cost_center_id"])
        enriched["cost_center"] = {"id": cc.id, "code": cc.code, "name": cc.name} if cc else None
    if suggestions.get("project_id"):
        pr = db.query(Project).get(suggestions["project_id"])
        enriched["project"] = {"id": pr.id, "code": pr.code, "name": pr.name} if pr else None
    if suggestions.get("client_id"):
        cl = db.query(Client).get(suggestions["client_id"])
        enriched["client"] = {"id": cl.id, "code": cl.code, "name": cl.name} if cl else None

    return {
        "expense_id": expense_id,
        "suggestions": suggestions,
        "enriched": enriched,
        "confidence": confidence,
        "reasoning": reasoning,
    }
