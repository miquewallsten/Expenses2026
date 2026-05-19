"""WhatsApp expense submission tool — photo receipt + NL expense creation.

When a user sends a photo of a receipt via WhatsApp, the channel dispatcher
extracts data and creates a draft expense. This tool handles the NL-triggered
creation with extracted receipt data included.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.schemas.expense import ExpenseCreate
from packages.modules.expenses.service.expense_service import create_expense as _svc_create

from ...core.context import AgentContext
from ...core.registry import REGISTRY, ToolResult, ToolSpec

_log = logging.getLogger(__name__)


# ── create_expense_from_receipt ───────────────────────────────────────────────

class _ReceiptExpenseArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount: float = Field(..., ge=0, description="Monto del gasto")
    description: str = Field(..., min_length=1, max_length=255, description="Descripción del gasto")
    expense_date: str | None = Field(default=None, description="Fecha YYYY-MM-DD")
    category_code: str | None = Field(default=None, description="Código de categoría (opcional)")
    vendor_name: str | None = Field(default=None, description="Nombre del proveedor (opcional)")
    currency: str = Field(default="MXN", description="Moneda: MXN, USD, EUR")
    exchange_rate: float | None = Field(default=None, description="Tipo de cambio si no es MXN")
    receipt_type: str = Field(default="photo", description="Tipo de recibo: photo, pdf, xml")
    source: str = Field(default="whatsapp", description="Canal de origen: whatsapp, email")


def _handle_create_expense_from_receipt(ctx: AgentContext, args: _ReceiptExpenseArgs) -> ToolResult:
    if not ctx.can_create_expenses:
        return ToolResult(ok=False, summary="No tienes permiso para crear gastos.", error="permission_denied")

    try:
        amount = Decimal(str(args.amount))
        # Calculate MXN amount for international expenses
        amount_mxn = amount
        if args.currency != "MXN" and args.exchange_rate:
            amount_mxn = amount * Decimal(str(args.exchange_rate))

        desc = args.description
        if args.vendor_name:
            desc = f"{args.vendor_name} — {desc}"
        desc = desc[:255]

        payload = ExpenseCreate(
            company_id=ctx.company_id,
            user_id=ctx.delegates_for_user_id or ctx.user_id,
            amount=amount,
            description=desc,
            category_code=args.category_code,
            settlement_type="reimbursable",
        )

        expense = _svc_create(ctx.db, payload)

        # Update currency fields if international
        if args.currency != "MXN":
            expense.currency = args.currency
            expense.exchange_rate = Decimal(str(args.exchange_rate)) if args.exchange_rate else None
            expense.amount_mxn = amount_mxn
            ctx.db.commit()

        # Tag the source
        expense.notes = f"source={args.source} receipt_type={args.receipt_type}"
        if args.vendor_name:
            expense.notes += f" vendor={args.vendor_name}"
        ctx.db.commit()
        ctx.db.refresh(expense)

        return ToolResult(
            ok=True,
            summary=f"Gasto creado: #{expense.id} — {desc} (${args.amount} {args.currency})",
            data={
                "expense_id": expense.id,
                "amount": float(expense.amount),
                "currency": args.currency,
                "description": desc,
                "status": expense.status,
                "category_code": expense.category_code,
            },
        )
    except ValueError as exc:
        return ToolResult(ok=False, summary=str(exc), error=str(exc))
    except Exception as exc:
        _log.exception("Receipt expense creation failed")
        return ToolResult(ok=False, summary=f"Error al crear gasto: {exc}", error=str(exc))


REGISTRY.register(ToolSpec(
    name="create_expense_from_receipt",
    description="Crea un gasto a partir de un recibo/foto (WhatsApp o email). Incluye moneda y proveedor.",
    category="entity",
    input_schema=_ReceiptExpenseArgs,
    handler=_handle_create_expense_from_receipt,
    personas=frozenset({"admin"}),
))


# ── list_my_expenses ──────────────────────────────────────────────────────────

class _MyExpensesArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str | None = Field(default=None, description="Filtrar por estado: draft, submitted, approved, rejected")
    limit: int = Field(default=10, ge=1, le=50)


def _handle_my_expenses(ctx: AgentContext, args: _MyExpensesArgs) -> ToolResult:
    q = ctx.db.query(Expense).filter(
        Expense.company_id == ctx.company_id,
        Expense.user_id == (ctx.delegates_for_user_id or ctx.user_id),
    )
    if args.status:
        q = q.filter(Expense.status == args.status)
    if hasattr(Expense, 'is_deleted'):
        q = q.filter(Expense.is_deleted == False)  # noqa: E712

    rows = q.order_by(Expense.created_at.desc()).limit(args.limit).all()

    out = [
        {
            "expense_id": e.id,
            "amount": float(e.amount_mxn or e.amount),
            "currency": getattr(e, "currency", "MXN") or "MXN",
            "description": e.description,
            "status": e.status,
            "category_code": e.category_code,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in rows
    ]

    status_label = args.status or "todos"
    return ToolResult(
        ok=True,
        summary=f"{len(out)} gastos ({status_label})",
        data={"expenses": out, "count": len(out)},
    )


REGISTRY.register(ToolSpec(
    name="list_my_expenses",
    description="Lista tus gastos recientes (filtrable por estado).",
    category="read",
    input_schema=_MyExpensesArgs,
    handler=_handle_my_expenses,
    personas=frozenset({"accounting", "admin"}),
))
