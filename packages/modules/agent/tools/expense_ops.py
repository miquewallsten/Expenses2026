"""Core expense operations — the agent's primary value-add for employees and managers.

These tools let users create expenses, track them, and move them through the
approval workflow without leaving the chat.  Destructive state changes
(approve / reject) use the two-phase receipt pattern so managers can review
before committing.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.schemas.expense import ExpenseCreate
from packages.modules.expenses.service.expense_service import (
    approve_expense as _svc_approve,
    create_expense as _svc_create,
    reject_expense as _svc_reject,
)
from packages.modules.expenses.service.review_queue_service import (
    is_manager_reviewable,
)

from ..core.context import AgentContext
from ..core.registry import REGISTRY, ToolResult, ToolSpec
from ._common import propose


# ── create_expense ───────────────────────────────────────────────────────────

class _CreateExpenseArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount:      float = Field(..., ge=0)
    description: str = Field(..., min_length=1, max_length=255)
    expense_date: str | None = None
    category_code: str | None = None
    settlement_type: str = Field(default="reimbursable")


def _handle_create_expense(ctx: AgentContext, args: _CreateExpenseArgs) -> ToolResult:
    try:
        payload = ExpenseCreate(
            company_id=ctx.company_id,
            amount=Decimal(str(args.amount)),
            description=args.description,
            category_code=args.category_code,
            settlement_type=args.settlement_type,
        )
        expense = _svc_create(ctx.db, payload)
        return ToolResult(
            ok=True,
            summary=f"Gasto creado: #{expense.id} — {args.description} (${args.amount})",
            data={
                "expense_id": expense.id,
                "amount": float(expense.amount),
                "description": expense.description,
                "status": expense.status,
                "category_code": expense.category_code,
            },
        )
    except ValueError as exc:
        return ToolResult(ok=False, summary=str(exc), error=str(exc))
    except Exception as exc:
        return ToolResult(ok=False, summary=f"Error al crear gasto: {exc}", error=str(exc))


REGISTRY.register(ToolSpec(
    name="create_expense",
    description="Crea un nuevo gasto (draft). Requiere monto y descripción.",
    category="entity",
    input_schema=_CreateExpenseArgs,
    handler=_handle_create_expense,
    personas=frozenset({"admin", "employee"}),
))


# ── list_pending_approvals ───────────────────────────────────────────────────

class _PendingArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    limit: int = Field(default=20, ge=1, le=100)


def _handle_list_pending(ctx: AgentContext, args: _PendingArgs) -> ToolResult:
    db: Session = ctx.db
    rows = (
        db.query(Expense)
        .filter(
            Expense.company_id == ctx.company_id,
            Expense.status.in_({"submitted", "manager_approved"}),
        )
        .order_by(Expense.created_at.desc())
        .limit(args.limit)
        .all()
    )
    out: list[dict[str, Any]] = []
    for e in rows:
        reviewable, _ = is_manager_reviewable(db, e)
        out.append({
            "expense_id": e.id,
            "amount": float(e.amount),
            "description": e.description,
            "status": e.status,
            "category_code": e.category_code,
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "awaiting_manager": reviewable,
        })
    summary = f"{len(out)} gastos pendientes de aprobación"
    return ToolResult(ok=True, summary=summary, data={"pending": out, "count": len(out)})


REGISTRY.register(ToolSpec(
    name="list_pending_approvals",
    description="Lista gastos pendientes de aprobación del manager.",
    category="read",
    input_schema=_PendingArgs,
    handler=_handle_list_pending,
    personas=frozenset({"admin", "manager", "finance_manager"}),
))


# ── approve_expense ──────────────────────────────────────────────────────────

class _ApproveArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expense_id: int = Field(..., ge=1)


def _handle_approve(ctx: AgentContext, args: _ApproveArgs) -> ToolResult:
    db: Session = ctx.db
    expense = db.query(Expense).filter(
        Expense.id == args.expense_id,
        Expense.company_id == ctx.company_id,
    ).first()
    if expense is None:
        return ToolResult(ok=False, summary="Gasto no encontrado", error="not_found")

    reviewable, reasons = is_manager_reviewable(db, expense)
    if not reviewable:
        return ToolResult(
            ok=False,
            summary="No se puede aprobar este gasto",
            error="; ".join(reasons),
        )

    return propose(
        ctx,
        tool_name="approve_expense",
        args={"expense_id": args.expense_id},
        preview={
            "action": "approve",
            "expense_id": expense.id,
            "amount": float(expense.amount),
            "description": expense.description,
            "current_status": expense.status,
            "new_status": "approved",
        },
        summary=f"Aprobar gasto #{expense.id}",
    )


def _apply_approve(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    expense = _svc_approve(ctx.db, args["expense_id"])
    if expense is None:
        raise ValueError("Gasto no encontrado")
    return {
        "expense_id": expense.id,
        "status": expense.status,
        "amount": float(expense.amount),
        "description": expense.description,
    }


REGISTRY.register(ToolSpec(
    name="approve_expense",
    description="Aprueba un gasto (requiere confirmación de dos fases).",
    category="entity",
    input_schema=_ApproveArgs,
    handler=_handle_approve,
    personas=frozenset({"admin", "manager", "finance_manager"}),
    destructive=True,
    requires_confirmation=True,
))


# ── reject_expense ───────────────────────────────────────────────────────────

class _RejectArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expense_id: int = Field(..., ge=1)
    reason: str = Field(default="", max_length=500)


def _handle_reject(ctx: AgentContext, args: _RejectArgs) -> ToolResult:
    db: Session = ctx.db
    expense = db.query(Expense).filter(
        Expense.id == args.expense_id,
        Expense.company_id == ctx.company_id,
    ).first()
    if expense is None:
        return ToolResult(ok=False, summary="Gasto no encontrado", error="not_found")

    reviewable, reasons = is_manager_reviewable(db, expense)
    if not reviewable:
        return ToolResult(
            ok=False,
            summary="No se puede rechazar este gasto",
            error="; ".join(reasons),
        )

    return propose(
        ctx,
        tool_name="reject_expense",
        args={"expense_id": args.expense_id, "reason": args.reason},
        preview={
            "action": "reject",
            "expense_id": expense.id,
            "amount": float(expense.amount),
            "description": expense.description,
            "current_status": expense.status,
            "new_status": "rejected",
            "reason": args.reason or None,
        },
        summary=f"Rechazar gasto #{expense.id}",
    )


def _apply_reject(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    expense = _svc_reject(ctx.db, args["expense_id"])
    if expense is None:
        raise ValueError("Gasto no encontrado")
    return {
        "expense_id": expense.id,
        "status": expense.status,
        "amount": float(expense.amount),
        "reason": args.get("reason"),
    }


REGISTRY.register(ToolSpec(
    name="reject_expense",
    description="Rechaza un gasto (requiere confirmación de dos fases).",
    category="entity",
    input_schema=_RejectArgs,
    handler=_handle_reject,
    personas=frozenset({"admin", "manager", "finance_manager"}),
    destructive=True,
    requires_confirmation=True,
))


# ── check_reimbursement_status ───────────────────────────────────────────────

class _ReimbursementArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expense_id: int | None = None
    limit: int = Field(default=10, ge=1, le=50)


def _handle_reimbursement_status(ctx: AgentContext, args: _ReimbursementArgs) -> ToolResult:
    db: Session = ctx.db
    q = db.query(Expense).filter(Expense.company_id == ctx.company_id)
    if args.expense_id:
        q = q.filter(Expense.id == args.expense_id)
    else:
        q = q.filter(Expense.status.in_({"approved", "rejected", "manager_approved"}))
    rows = q.order_by(Expense.created_at.desc()).limit(args.limit).all()

    out: list[dict[str, Any]] = []
    for e in rows:
        out.append({
            "expense_id": e.id,
            "amount": float(e.amount),
            "description": e.description,
            "status": e.status,
            "settlement_type": e.settlement_type,
            "category_code": e.category_code,
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "paid": e.status == "approved",
        })

    if args.expense_id and not out:
        return ToolResult(ok=False, summary="Gasto no encontrado", error="not_found")

    summary = (
        f"Estado de reembolso para gasto #{args.expense_id}"
        if args.expense_id
        else f"{len(out)} gastos en seguimiento"
    )
    return ToolResult(ok=True, summary=summary, data={"expenses": out, "count": len(out)})


REGISTRY.register(ToolSpec(
    name="check_reimbursement_status",
    description="Consulta el estado de reembolso de uno o varios gastos.",
    category="read",
    input_schema=_ReimbursementArgs,
    handler=_handle_reimbursement_status,
    personas=frozenset({"admin", "employee", "manager", "finance_manager"}),
))
