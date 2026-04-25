"""Phase 5.6 — Agent V2 finance copilot tools.

Read-only tools registered under ``finance_manager`` (and ``admin``) personas.
All tools are tenant-scoped via ``ctx.company_id`` and produce structured
``ToolResult.data`` for the agent to summarise.

  • find_missing_receipts   — approved expenses with no documents attached
  • match_cfdis_batch       — unmatched expenses ↔ orphan CFDI docs (UUID-based)
  • generate_poliza_preview — calls poliza_simulator_service for one expense
  • run_month_end           — orchestrator: aggregates the three above + counts
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, or_

from packages.modules.accounting.service.poliza_simulator_service import (
    simulate_poliza,
)
from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.models.expense import Expense

from ..core.context import AgentContext
from ..core.registry import REGISTRY, ToolResult, ToolSpec


_FINANCE_PERSONAS = frozenset({"admin", "finance_manager"})


# ── find_missing_receipts ───────────────────────────────────────────────────


class _MissingArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str = Field(default="approved")
    limit: int = Field(default=50, ge=1, le=500)


def _find_missing_receipts(ctx: AgentContext, args: _MissingArgs) -> ToolResult:
    db = ctx.db
    docs_subq = (
        db.query(ExpenseDocument.expense_id)
        .filter(
            ExpenseDocument.company_id == ctx.company_id,
            ExpenseDocument.expense_id.is_not(None),
        )
        .distinct()
        .subquery()
    )
    rows = (
        db.query(Expense)
        .filter(
            Expense.company_id == ctx.company_id,
            Expense.status == args.status,
            ~Expense.id.in_(db.query(docs_subq.c.expense_id)),
        )
        .order_by(Expense.expense_date.desc(), Expense.id.desc())
        .limit(args.limit)
        .all()
    )
    out = [
        {
            "expense_id": e.id,
            "amount": float(e.amount or 0),
            "description": e.description,
            "expense_date": e.expense_date.isoformat() if e.expense_date else None,
            "category_code": e.category_code,
        }
        for e in rows
    ]
    return ToolResult(
        ok=True,
        summary=f"{len(out)} gastos {args.status} sin recibo adjunto",
        data={"missing": out, "count": len(out), "status": args.status},
    )


REGISTRY.register(ToolSpec(
    name="find_missing_receipts",
    description="Lista gastos aprobados sin documentos adjuntos.",
    category="read",
    input_schema=_MissingArgs,
    handler=_find_missing_receipts,
    personas=_FINANCE_PERSONAS,
))


# ── match_cfdis_batch ───────────────────────────────────────────────────────


class _MatchArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    limit: int = Field(default=100, ge=1, le=500)


def _match_cfdis_batch(ctx: AgentContext, args: _MatchArgs) -> ToolResult:
    db = ctx.db
    expenses = (
        db.query(Expense)
        .filter(
            Expense.company_id == ctx.company_id,
            Expense.cfdi_uuid.is_not(None),
        )
        .limit(args.limit)
        .all()
    )
    matches: list[dict[str, Any]] = []
    unmatched: list[dict[str, Any]] = []
    for e in expenses:
        uuid = (e.cfdi_uuid or "").strip()
        if not uuid:
            continue
        doc = (
            db.query(ExpenseDocument)
            .filter(
                ExpenseDocument.company_id == ctx.company_id,
                ExpenseDocument.expense_id.is_(None),
                or_(
                    ExpenseDocument.filename.ilike(f"%{uuid}%"),
                    ExpenseDocument.content_text.ilike(f"%{uuid}%"),
                ),
            )
            .first()
        )
        if doc is not None:
            matches.append({
                "expense_id": e.id,
                "document_id": doc.id,
                "cfdi_uuid": uuid,
                "filename": doc.filename,
            })
        else:
            unmatched.append({"expense_id": e.id, "cfdi_uuid": uuid})
    return ToolResult(
        ok=True,
        summary=f"{len(matches)} CFDIs emparejados, {len(unmatched)} sin par",
        data={
            "matched": matches,
            "unmatched": unmatched,
            "match_count": len(matches),
            "unmatched_count": len(unmatched),
        },
    )


REGISTRY.register(ToolSpec(
    name="match_cfdis_batch",
    description="Empareja gastos con CFDIs huérfanos por UUID.",
    category="read",
    input_schema=_MatchArgs,
    handler=_match_cfdis_batch,
    personas=_FINANCE_PERSONAS,
))


# ── generate_poliza_preview ─────────────────────────────────────────────────


class _PolizaArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expense_id: int


def _generate_poliza_preview(ctx: AgentContext, args: _PolizaArgs) -> ToolResult:
    e = (
        ctx.db.query(Expense)
        .filter(
            Expense.id == args.expense_id,
            Expense.company_id == ctx.company_id,
        )
        .first()
    )
    if e is None:
        return ToolResult(
            ok=False,
            summary=f"Gasto {args.expense_id} no encontrado",
            error="not_found",
        )
    expense_dict = {
        "amount": float(e.amount or 0),
        "category_code": e.category_code,
        "description": e.description,
        "date": e.expense_date.isoformat() if e.expense_date else None,
    }
    preview = simulate_poliza(ctx.db, ctx.company_id, expense_dict)
    return ToolResult(
        ok=True,
        summary=(
            f"Póliza para gasto {e.id}: "
            f"D={preview['total_debit']} / C={preview['total_credit']}"
        ),
        data={"expense_id": e.id, "preview": preview},
    )


REGISTRY.register(ToolSpec(
    name="generate_poliza_preview",
    description="Genera una vista previa de la póliza contable de un gasto.",
    category="read",
    input_schema=_PolizaArgs,
    handler=_generate_poliza_preview,
    personas=_FINANCE_PERSONAS,
))


# ── run_month_end ───────────────────────────────────────────────────────────


class _MonthEndArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sample_limit: int = Field(default=20, ge=1, le=100)


def _run_month_end(ctx: AgentContext, args: _MonthEndArgs) -> ToolResult:
    missing = _find_missing_receipts(
        ctx, _MissingArgs(status="approved", limit=args.sample_limit)
    )
    matched = _match_cfdis_batch(ctx, _MatchArgs(limit=args.sample_limit * 5))

    pending_count = (
        ctx.db.query(Expense)
        .filter(
            Expense.company_id == ctx.company_id,
            Expense.status.in_(("submitted", "manager_approved")),
        )
        .count()
    )
    cancelled_count = (
        ctx.db.query(Expense)
        .filter(
            Expense.company_id == ctx.company_id,
            Expense.cfdi_status == "Cancelado",
        )
        .count()
    )

    summary_lines = [
        f"Pendientes de aprobar: {pending_count}",
        f"Sin recibo: {missing.data['count']}",
        f"CFDIs sin emparejar: {matched.data['unmatched_count']}",
        f"CFDIs cancelados: {cancelled_count}",
    ]
    return ToolResult(
        ok=True,
        summary="Cierre mensual — " + " · ".join(summary_lines),
        data={
            "pending_approval_count": pending_count,
            "missing_receipts": missing.data,
            "cfdi_match": matched.data,
            "cancelled_cfdi_count": cancelled_count,
        },
    )


REGISTRY.register(ToolSpec(
    name="run_month_end",
    description="Resumen del estado del cierre mensual.",
    category="read",
    input_schema=_MonthEndArgs,
    handler=_run_month_end,
    personas=_FINANCE_PERSONAS,
))
