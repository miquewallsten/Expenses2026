"""WhatsApp approval actions — quick approve/reject for managers.

Managers can approve or reject expenses via WhatsApp by simply saying
"aprobar 5" or "rechazar 5 motivo: fuera de política".
This tool resolves the expense and performs the transition.
"""

from __future__ import annotations

import logging
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.service.transition_service import (
    manager_approve_expense,
    manager_reject_expense,
    manager_return_expense,
)
from packages.modules.expenses.service.review_queue_service import is_manager_reviewable

from ...core.context import AgentContext
from ...core.registry import REGISTRY, ToolResult, ToolSpec
from .._common import propose

_log = logging.getLogger(__name__)


# ── quick_approve ─────────────────────────────────────────────────────────────

class _QuickApproveArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expense_id: int = Field(..., ge=1, description="ID del gasto a aprobar")


def _handle_quick_approve(ctx: AgentContext, args: _QuickApproveArgs) -> ToolResult:
    expense = ctx.db.query(Expense).filter(
        Expense.id == args.expense_id,
        Expense.company_id == ctx.company_id,
    ).first()

    if expense is None:
        return ToolResult(ok=False, summary=f"Gasto #{args.expense_id} no encontrado.", error="not_found")

    reviewable, reasons = is_manager_reviewable(ctx.db, expense)
    if not reviewable:
        return ToolResult(
            ok=False,
            summary=f"No se puede aprobar gasto #{args.expense_id}: {'; '.join(reasons)}",
            error="not_reviewable",
        )

    return propose(
        ctx,
        tool_name="quick_approve",
        args={"expense_id": args.expense_id},
        preview={
            "action": "approve",
            "expense_id": expense.id,
            "amount": float(expense.amount_mxn or expense.amount),
            "currency": getattr(expense, "currency", "MXN") or "MXN",
            "description": expense.description,
            "current_status": expense.status,
        },
        summary=f"Aprobar gasto #{expense.id} — {expense.description} (${float(expense.amount_mxn or expense.amount)})",
    )


def _apply_quick_approve(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    expense = manager_approve_expense(ctx.db, args["expense_id"], actor_user_id=ctx.user_id)
    if expense is None:
        raise ValueError("Gasto no encontrado")
    return {
        "expense_id": expense.id,
        "status": expense.status,
        "amount": float(expense.amount_mxn or expense.amount),
    }


REGISTRY.register(ToolSpec(
    name="quick_approve",
    description="Aprueba un gasto pendiente (acción rápida por WhatsApp).",
    category="entity",
    input_schema=_QuickApproveArgs,
    handler=_handle_quick_approve,
    personas=frozenset({"accounting", "admin"}),
    destructive=True,
    requires_confirmation=True,
))


# ── quick_reject ──────────────────────────────────────────────────────────────

class _QuickRejectArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expense_id: int = Field(..., ge=1, description="ID del gasto a rechazar")
    reason: str = Field(default="", max_length=500, description="Razón del rechazo")


def _handle_quick_reject(ctx: AgentContext, args: _QuickRejectArgs) -> ToolResult:
    expense = ctx.db.query(Expense).filter(
        Expense.id == args.expense_id,
        Expense.company_id == ctx.company_id,
    ).first()

    if expense is None:
        return ToolResult(ok=False, summary=f"Gasto #{args.expense_id} no encontrado.", error="not_found")

    reviewable, reasons = is_manager_reviewable(ctx.db, expense)
    if not reviewable:
        return ToolResult(
            ok=False,
            summary=f"No se puede rechazar gasto #{args.expense_id}: {'; '.join(reasons)}",
            error="not_reviewable",
        )

    return propose(
        ctx,
        tool_name="quick_reject",
        args={"expense_id": args.expense_id, "reason": args.reason},
        preview={
            "action": "reject",
            "expense_id": expense.id,
            "amount": float(expense.amount_mxn or expense.amount),
            "description": expense.description,
            "reason": args.reason or None,
        },
        summary=f"Rechazar gasto #{expense.id} — {args.reason[:50] if args.reason else 'sin razón'}",
    )


def _apply_quick_reject(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    expense = manager_reject_expense(ctx.db, args["expense_id"], actor_user_id=ctx.user_id)
    if expense is None:
        raise ValueError("Gasto no encontrado")
    return {
        "expense_id": expense.id,
        "status": expense.status,
        "reason": args.get("reason"),
    }


REGISTRY.register(ToolSpec(
    name="quick_reject",
    description="Rechaza un gasto pendiente con razón (acción rápida por WhatsApp).",
    category="entity",
    input_schema=_QuickRejectArgs,
    handler=_handle_quick_reject,
    personas=frozenset({"accounting", "admin"}),
    destructive=True,
    requires_confirmation=True,
))


# ── submit_expense ────────────────────────────────────────────────────────────

class _SubmitExpenseArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expense_id: int = Field(..., ge=1, description="ID del gasto a enviar para aprobación")


def _handle_submit_expense(ctx: AgentContext, args: _SubmitExpenseArgs) -> ToolResult:
    """Submit a draft expense for approval — used after creating via WhatsApp."""
    from packages.modules.expenses.service.transition_service import submit_expense

    expense = ctx.db.query(Expense).filter(
        Expense.id == args.expense_id,
        Expense.company_id == ctx.company_id,
    ).first()

    if expense is None:
        return ToolResult(ok=False, summary=f"Gasto #{args.expense_id} no encontrado.", error="not_found")

    if expense.status != "draft":
        return ToolResult(ok=False, summary=f"Gasto #{args.expense_id} no está en borrador (estado: {expense.status}).", error="wrong_status")

    try:
        expense = submit_expense(ctx.db, expense, actor_user_id=ctx.user_id)
        return ToolResult(
            ok=True,
            summary=f"Gasto #{expense.id} enviado para aprobación.",
            data={"expense_id": expense.id, "status": expense.status},
        )
    except Exception as exc:
        return ToolResult(ok=False, summary=f"Error al enviar gasto: {exc}", error=str(exc))


REGISTRY.register(ToolSpec(
    name="submit_expense",
    description="Envía un gasto en borrador para aprobación.",
    category="entity",
    input_schema=_SubmitExpenseArgs,
    handler=_handle_submit_expense,
    personas=frozenset({"admin"}),
))
