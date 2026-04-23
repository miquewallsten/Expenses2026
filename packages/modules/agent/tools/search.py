"""Domain search tools — structured search over expenses, users, projects.

Read-only; no receipts. Results are tenant-scoped.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_

from packages.core.platform.models_user import User
from packages.modules.expenses.models.expense import Expense

from ..core.context import AgentContext
from ..core.registry import REGISTRY, ToolResult, ToolSpec


_ADMIN_ONLY = frozenset(("admin",))


# ── search_expenses ─────────────────────────────────────────────────────────

class SearchExpensesInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    q:           str | None = Field(default=None, max_length=200)
    status:      str | None = Field(default=None, max_length=64)
    min_amount:  float | None = Field(default=None, ge=0)
    max_amount:  float | None = Field(default=None, ge=0)
    date_from:   date | None = None
    date_to:     date | None = None
    employee_id: int | None = None
    limit:       int = Field(default=20, ge=1, le=100)


def _handle_search_expenses(ctx: AgentContext, a: SearchExpensesInput) -> ToolResult:
    q = ctx.db.query(Expense).filter(Expense.company_id == ctx.company_id)
    if a.q:
        like = f"%{a.q}%"
        cols = []
        for col_name in ("description", "merchant_name", "vendor_name", "notes"):
            col = getattr(Expense, col_name, None)
            if col is not None:
                cols.append(col.ilike(like))
        if cols:
            q = q.filter(or_(*cols))
    if a.status:
        q = q.filter(Expense.status == a.status)
    if a.min_amount is not None:
        q = q.filter(Expense.amount >= a.min_amount)
    if a.max_amount is not None:
        q = q.filter(Expense.amount <= a.max_amount)
    if a.date_from and hasattr(Expense, "expense_date"):
        q = q.filter(Expense.expense_date >= a.date_from)
    if a.date_to and hasattr(Expense, "expense_date"):
        q = q.filter(Expense.expense_date <= a.date_to)
    if a.employee_id is not None and hasattr(Expense, "employee_id"):
        q = q.filter(Expense.employee_id == a.employee_id)
    rows = q.order_by(Expense.id.desc()).limit(a.limit).all()
    items: list[dict[str, Any]] = []
    for r in rows:
        items.append({
            "id": r.id,
            "amount": float(getattr(r, "amount", 0) or 0),
            "currency": getattr(r, "currency", None),
            "status": getattr(r, "status", None),
            "description": getattr(r, "description", None),
            "expense_date": getattr(r, "expense_date", None),
        })
    return ToolResult(ok=True, summary=f"{len(items)} gastos", data={"items": items})


REGISTRY.register(ToolSpec(
    name="search_expenses",
    description="Busca gastos por texto, estado, monto, fecha o empleado.",
    category="read",
    input_schema=SearchExpensesInput,
    handler=_handle_search_expenses,
    personas=_ADMIN_ONLY,
))


# ── search_users ────────────────────────────────────────────────────────────

class SearchUsersInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    q:     str | None = Field(default=None, max_length=200)
    role:  str | None = Field(default=None, max_length=64)
    limit: int = Field(default=20, ge=1, le=100)


def _handle_search_users(ctx: AgentContext, a: SearchUsersInput) -> ToolResult:
    q = ctx.db.query(User).filter(User.company_id == ctx.company_id)
    if a.q:
        like = f"%{a.q}%"
        cols = []
        for col_name in ("email", "full_name", "first_name", "last_name"):
            col = getattr(User, col_name, None)
            if col is not None:
                cols.append(col.ilike(like))
        if cols:
            q = q.filter(or_(*cols))
    if a.role:
        q = q.filter(User.role == a.role)
    rows = q.order_by(User.id.asc()).limit(a.limit).all()
    items = [{
        "id": r.id,
        "email": r.email,
        "role": getattr(r, "role", None),
        "full_name": getattr(r, "full_name", None),
    } for r in rows]
    return ToolResult(ok=True, summary=f"{len(items)} usuarios", data={"items": items})


REGISTRY.register(ToolSpec(
    name="search_users",
    description="Busca usuarios por texto o rol.",
    category="read",
    input_schema=SearchUsersInput,
    handler=_handle_search_users,
    personas=_ADMIN_ONLY,
))


# ── search_projects ─────────────────────────────────────────────────────────

class SearchProjectsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    q:     str | None = Field(default=None, max_length=200)
    limit: int = Field(default=20, ge=1, le=100)


def _handle_search_projects(ctx: AgentContext, a: SearchProjectsInput) -> ToolResult:
    try:
        from packages.core.platform.models_project import Project
    except Exception:
        return ToolResult(ok=True, summary="0 proyectos", data={"items": []})
    q = ctx.db.query(Project).filter(Project.company_id == ctx.company_id)
    if a.q:
        like = f"%{a.q}%"
        cols = []
        for col_name in ("name", "project_code", "code"):
            col = getattr(Project, col_name, None)
            if col is not None:
                cols.append(col.ilike(like))
        if cols:
            q = q.filter(or_(*cols))
    rows = q.order_by(Project.id.desc()).limit(a.limit).all()
    items = [{
        "id": r.id,
        "name": getattr(r, "name", None),
        "code": getattr(r, "project_code", None) or getattr(r, "code", None),
    } for r in rows]
    return ToolResult(ok=True, summary=f"{len(items)} proyectos", data={"items": items})


REGISTRY.register(ToolSpec(
    name="search_projects",
    description="Busca proyectos por texto.",
    category="read",
    input_schema=SearchProjectsInput,
    handler=_handle_search_projects,
    personas=_ADMIN_ONLY,
))
