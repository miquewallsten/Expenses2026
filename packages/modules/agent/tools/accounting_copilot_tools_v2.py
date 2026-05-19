"""Accounting Copilot Tools v2 — CFDI, póliza, budget, review queue, month-end,
subcontractor, multi-currency, and analytics tools.

These complete the accountant's toolkit so the copilot can handle the entire
accounting workflow from expense review to month-end close and SAT export.
"""
from __future__ import annotations

from datetime import datetime, date
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from packages.core.platform.models_user import User
from packages.core.platform.models_cost_center import CostCenter
from packages.core.platform.models_project import Project
from packages.core.platform.models_client import Client
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.expense_allocation import ExpenseAllocation

from ..core.context import AgentContext
from ..core.registry import REGISTRY, ToolResult, ToolSpec


# ── CFDI / Fiscal compliance ────────────────────────────────────────────────

class CfdiPairArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expense_id: int
    cfdi_uuid: str = Field(..., min_length=1)
    cfdi_xml: str | None = None


def _cfdi_pair(ctx: AgentContext, args: CfdiPairArgs) -> ToolResult:
    expense = ctx.db.query(Expense).filter(
        Expense.id == args.expense_id, Expense.company_id == ctx.company_id
    ).first()
    if not expense:
        return ToolResult(ok=False, summary=f"Gasto {args.expense_id} no encontrado", error="not_found")
    expense.cfdi_uuid = args.cfdi_uuid
    expense.cfdi_status = "matched"
    ctx.db.commit()
    return ToolResult(ok=True, summary=f"CFDI {args.cfdi_uuid[:8]}... vinculado al gasto {args.expense_id}")


class CfdiMassCheckArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status_filter: str = Field(default="approved", description="Filter expenses by status")


def _cfdi_mass_check(ctx: AgentContext, args: CfdiMassCheckArgs) -> ToolResult:
    expenses = ctx.db.query(Expense).filter(
        Expense.company_id == ctx.company_id,
        Expense.status == args.status_filter,
    ).all()
    missing = [e for e in expenses if not e.cfdi_uuid]
    matched = [e for e in expenses if e.cfdi_uuid and e.cfdi_status == "matched"]
    mismatch = [e for e in expenses if e.cfdi_uuid and e.cfdi_status == "mismatch"]
    data = {
        "total": len(expenses),
        "missing_cfdi": len(missing),
        "matched": len(matched),
        "mismatch": len(mismatch),
        "missing_ids": [{"id": e.id, "desc": (e.description or "")[:40], "amount": float(e.amount or 0)} for e in missing[:20]],
    }
    return ToolResult(ok=True, summary=f"{len(missing)} sin CFDI, {len(matched)} vinculados, {len(mismatch)} con inconsistencia", data=data)


# ── Póliza generation & export ──────────────────────────────────────────────

class PolizaGenerateArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expense_ids: list[int] | None = None
    all_approved: bool = Field(default=False, description="Generate for all approved expenses")
    format: str = Field(default="sat", pattern=r"^(coi|contpaqi|sat|custom)$")


class PolizaPreviewArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expense_id: int


def _poliza_preview(ctx: AgentContext, args: PolizaPreviewArgs) -> ToolResult:
    from packages.modules.accounting.service.poliza_simulator_service import simulate_poliza
    expense = ctx.db.query(Expense).filter(Expense.id == args.expense_id, Expense.company_id == ctx.company_id).first()
    if not expense:
        return ToolResult(ok=False, summary=f"Gasto {args.expense_id} no encontrado", error="not_found")
    result = simulate_poliza(ctx.db, ctx.company_id, {
        "amount": float(expense.amount or 0),
        "category_code": expense.category_code or "",
        "description": expense.description,
        "date": expense.expense_date.isoformat() if expense.expense_date else None,
    })
    lines_preview = [f"  {l['account_code']} | D:{l['debit']} C:{l['credit']} | {l['note']}" for l in result.get("lines", [])]
    summary = f"Póliza gasto #{args.expense_id}: {'✓ balanceada' if result.get('balanced') else '✗ desbalanceada'}"
    if result.get("warnings"):
        summary += f" ({len(result['warnings'])} advertencias)"
    return ToolResult(ok=True, summary=summary, data={
        "balanced": result.get("balanced"),
        "lines": result.get("lines"),
        "warnings": result.get("warnings"),
        "total_debit": result.get("total_debit"),
        "total_credit": result.get("total_credit"),
    })


# ── Budget & analytics ─────────────────────────────────────────────────────

class BudgetVsActualArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: str = Field(..., pattern=r"^(cost-centers|projects|clients)$")
    period: str | None = Field(default=None, description="e.g. '2026-05' for specific month")


def _budget_vs_actual(ctx: AgentContext, args: BudgetVsActualArgs) -> ToolResult:
    from packages.modules.admin.api.dimensions_router import Kind
    from sqlalchemy import func as sa_func
    
    model_map = {"cost-centers": CostCenter, "projects": Project, "clients": Client}
    fk_col_map = {"cost-centers": ExpenseAllocation.cost_center_id, "projects": ExpenseAllocation.project_id, "clients": ExpenseAllocation.client_id}
    model = model_map.get(args.kind)
    fk_col = fk_col_map.get(args.kind)
    if not model:
        return ToolResult(ok=False, summary=f"Tipo desconocido: {args.kind}", error="invalid_kind")
    
    items = ctx.db.query(model).filter(model.company_id == ctx.company_id, model.status == "active").all()
    spend_q = (
        ctx.db.query(fk_col, sa_func.sum(Expense.amount))
        .join(Expense, Expense.id == ExpenseAllocation.expense_id)
        .filter(Expense.company_id == ctx.company_id, Expense.status.in_(["submitted", "manager_approved", "approved"]))
        .group_by(fk_col)
        .all()
    )
    spend_map = {row[0]: float(row[1] or 0) for row in spend_q}
    
    results = []
    for item in items:
        budget = getattr(item, "budget_amount", None)
        spent = spend_map.get(item.id, 0.0)
        results.append({
            "code": item.code, "name": item.name,
            "budget": budget, "spent": spent,
            "remaining": (budget - spent) if budget is not None else None,
            "pct": round(spent / budget * 100, 1) if budget and budget > 0 else None,
        })
    
    over_budget = [r for r in results if r["pct"] is not None and r["pct"] > 100]
    summary = f"{len(results)} {args.kind}: {len(over_budget)} sobre presupuesto"
    return ToolResult(ok=True, summary=summary, data={"items": results, "over_budget_count": len(over_budget)})


class ExpenseTrendsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    months: int = Field(default=6, ge=1, le=24)
    group_by: str = Field(default="category", pattern=r"^(category|dimension|vendor)$")


def _expense_trends(ctx: AgentContext, args: ExpenseTrendsArgs) -> ToolResult:
    from sqlalchemy import func as sa_func, extract
    expenses = ctx.db.query(Expense).filter(Expense.company_id == ctx.company_id).order_by(Expense.created_at.desc()).limit(500).all()
    
    monthly = {}
    for e in expenses:
        month = e.created_at.strftime("%Y-%m") if e.created_at else "unknown"
        if month not in monthly:
            monthly[month] = {"count": 0, "total": 0.0}
        monthly[month]["count"] += 1
        monthly[month]["total"] += float(e.amount or 0)
    
    sorted_months = sorted(monthly.items(), reverse=True)[:args.months]
    data = [{"month": m, **v} for m, v in sorted_months]
    total = sum(d["total"] for d in data)
    summary = f"Últimos {len(data)} meses: ${total:,.0f} MXN total"
    return ToolResult(ok=True, summary=summary, data={"trends": data, "total": total})


class TopVendorsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    limit: int = Field(default=10, ge=1, le=50)


def _top_vendors(ctx: AgentContext, args: TopVendorsArgs) -> ToolResult:
    from sqlalchemy import func as sa_func
    # Expenses may have vendor info in description or tags
    expenses = ctx.db.query(Expense).filter(Expense.company_id == ctx.company_id).order_by(Expense.amount.desc()).limit(200).all()
    vendor_totals = {}
    for e in expenses:
        vendor = getattr(e, "vendor_name", None) or ""
        if not vendor:
            # Try to extract from tags
            tags = getattr(e, "tags", None) or []
            if isinstance(tags, list):
                vendor = tags[0] if tags else ""
        if not vendor:
            vendor = "(sin proveedor)"
        vendor_totals[vendor] = vendor_totals.get(vendor, 0) + float(e.amount or 0)
    
    top = sorted(vendor_totals.items(), key=lambda x: x[1], reverse=True)[:args.limit]
    data = [{"vendor": v, "total": round(t, 2)} for v, t in top]
    summary = f"Top {len(top)} proveedores: ${sum(t for _, t in top):,.0f} MXN"
    return ToolResult(ok=True, summary=summary, data=data)


# ── Accounting review queue ────────────────────────────────────────────────

class _Empty(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _review_queue(ctx: AgentContext, args: _Empty) -> ToolResult:
    expenses = ctx.db.query(Expense).filter(
        Expense.company_id == ctx.company_id,
        Expense.status.in_(["submitted", "manager_approved"]),
    ).order_by(Expense.created_at).limit(50).all()
    
    data = [{
        "id": e.id, "description": (e.description or "")[:60],
        "amount": float(e.amount or 0), "status": e.status,
        "category_code": e.category_code,
        "has_cfdi": bool(e.cfdi_uuid),
        "date": e.expense_date.isoformat() if e.expense_date else None,
    } for e in expenses]
    
    total = sum(d["amount"] for d in data)
    no_cat = sum(1 for d in data if not d["category_code"])
    no_cfdi = sum(1 for d in data if not d["has_cfdi"])
    summary = f"{len(data)} pendientes (${total:,.0f} MXN): {no_cat} sin categoría, {no_cfdi} sin CFDI"
    return ToolResult(ok=True, summary=summary, data=data)


class AccountingReviewArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expense_id: int
    action: str = Field(..., pattern=r"^(approve|reject)$")
    reason: str | None = None


def _accounting_review(ctx: AgentContext, args: AccountingReviewArgs) -> ToolResult:
    expense = ctx.db.query(Expense).filter(Expense.id == args.expense_id, Expense.company_id == ctx.company_id).first()
    if not expense:
        return ToolResult(ok=False, summary=f"Gasto {args.expense_id} no encontrado", error="not_found")
    
    if args.action == "approve":
        expense.status = "approved"
        ctx.db.commit()
        # Trigger auto póliza generation if configured
        try:
            from packages.modules.accounting.service.poliza_auto_generate_service import on_expense_approved
            result = on_expense_approved(ctx.db, args.expense_id)
            poliza_note = f" Póliza: {'✓' if result['event_generated'] else 'pendiente'}" if result else ""
        except Exception:
            poliza_note = ""
        return ToolResult(ok=True, summary=f"Gasto {args.expense_id} aprobado contablemente.{poliza_note}")
    else:
        expense.status = "rejected"
        if args.reason:
            expense.notes = f"[Contabilidad] {args.reason}"
        ctx.db.commit()
        return ToolResult(ok=True, summary=f"Gasto {args.expense_id} rechazado: {args.reason or 'sin motivo'}")


# ── Month-end close ────────────────────────────────────────────────────────

class MonthCloseArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    period: str = Field(..., description="e.g. '2026-05'")
    export_format: str = Field(default="sat", pattern=r"^(coi|contpaqi|sat|custom)$")


def _month_close(ctx: AgentContext, args: MonthCloseArgs) -> ToolResult:
    from packages.modules.accounting.service.accounting_dashboard_service import get_dashboard
    dash = get_dashboard(ctx.db, ctx.company_id)
    
    pending = dash["pending_review"]["count"]
    if pending > 0:
        return ToolResult(ok=False, summary=f"No se puede cerrar: {pending} gastos pendientes de revisión", error="pending_items")
    
    uncat = dash["category_coverage"]["uncategorized"]
    if uncat > 0:
        return ToolResult(ok=False, summary=f"No se puede cerrar: {uncat} gastos sin categorizar", error="uncategorized")
    
    # All clear - generate export
    from packages.modules.accounting.service.bulk_simulator_service import bulk_simulate
    from packages.modules.accounting.service.poliza_export_service import render_sat_polizas, render_contpaqi, render_coi
    
    bulk = bulk_simulate(ctx.db, ctx.company_id, limit=500, statuses=("approved",))
    
    if args.export_format == "sat":
        output = render_sat_polizas(bulk)
    elif args.export_format == "contpaqi":
        output = render_contpaqi(bulk)
    else:
        output = render_coi(bulk)
    
    return ToolResult(ok=True, summary=f"Cierre {args.period}: {bulk['count']} pólizas generadas ({args.export_format})", data={
        "period": args.period, "format": args.export_format,
        "count": bulk["count"], "balanced": bulk["balanced"],
        "total_debit": bulk["total_debit"], "total_credit": bulk["total_credit"],
        "output_preview": output[:500],
    })


# ── Subcontractor ──────────────────────────────────────────────────────────

class CreateSubcontractorArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., min_length=1)
    rfc: str = Field(..., min_length=3, max_length=20)
    legal_name: str | None = None
    contact_email: str | None = None


def _create_subcontractor(ctx: AgentContext, args: CreateSubcontractorArgs) -> ToolResult:
    from packages.modules.accounting.service.subcontractor_service import create_subcontractor
    try:
        result = create_subcontractor(ctx.db, ctx.company_id, args.model_dump())
        return ToolResult(ok=True, summary=f"Subcontratista '{args.name}' (RFC: {args.rfc}) creado", data=result)
    except ValueError as e:
        return ToolResult(ok=False, summary=str(e), error="duplicate")


def _list_subcontractors(ctx: AgentContext, args: _Empty) -> ToolResult:
    from packages.modules.accounting.service.subcontractor_service import list_subcontractors
    result = list_subcontractors(ctx.db, ctx.company_id)
    summary = f"{len(result)} subcontratistas registrados"
    return ToolResult(ok=True, summary=summary, data=result)


class RetentionArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subtotal: float = Field(..., description="Subtotal before tax")
    iva_rate: float = Field(default=0.16, description="IVA rate as decimal (0.16 = 16%)")
    isr_rate: float = Field(default=0.10, description="ISR retention rate")
    iva_retention_rate: float = Field(default=0.1067, description="IVA retention rate (4/3 * IVA for honorarios)")


def _calculate_retentions(ctx: AgentContext, args: RetentionArgs) -> ToolResult:
    subtotal = args.subtotal
    iva = round(subtotal * args.iva_rate, 2)
    isr_ret = round(subtotal * args.isr_rate, 2)
    iva_ret = round(subtotal * args.iva_retention_rate, 2)
    net_pay = round(subtotal + iva - isr_ret - iva_ret, 2)
    
    data = {
        "subtotal": subtotal, "iva": iva,
        "isr_retention": isr_ret, "iva_retention": iva_ret,
        "net_payable": net_pay,
        "rates": {"iva": args.iva_rate, "isr": args.isr_rate, "iva_ret": args.iva_retention_rate},
    }
    summary = f"Subtotal ${subtotal:,.2f} + IVA ${iva:,.2f} - ISR ${isr_ret:,.2f} - Ret IVA ${iva_ret:,.2f} = Net ${net_pay:,.2f}"
    return ToolResult(ok=True, summary=summary, data=data)


# ── Time tracking → accounting ──────────────────────────────────────────────

def _time_allocation_summary(ctx: AgentContext, args: _Empty) -> ToolResult:
    from packages.modules.accounting.service.time_tracking_integration_service import get_time_allocation_summary
    result = get_time_allocation_summary(ctx.db, ctx.company_id)
    summary = f"{result['total_hours']:.1f} horas, ${result['total_cost']:,.0f} MXN"
    return ToolResult(ok=True, summary=summary, data=result)


# ── Multi-currency ──────────────────────────────────────────────────────────

class ExchangeRateArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    from_currency: str = Field(default="USD")
    to_currency: str = Field(default="MXN")


def _exchange_rate(ctx: AgentContext, args: ExchangeRateArgs) -> ToolResult:
    try:
        import requests
        r = requests.get(f"https://open.er-api.com/v6/latest/{args.from_currency}", timeout=5)
        r.raise_for_status()
        data = r.json()
        rate = data.get("rates", {}).get(args.to_currency)
        if not rate:
            return ToolResult(ok=False, summary=f"Tasa no disponible para {args.from_currency}→{args.to_currency}", error="no_rate")
        return ToolResult(ok=True, summary=f"1 {args.from_currency} = {rate:.4f} {args.to_currency}", data={"rate": rate, "from": args.from_currency, "to": args.to_currency})
    except Exception as e:
        return ToolResult(ok=False, summary=f"Error obteniendo tasa: {e}", error="api_error")


class ConvertCurrencyArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount: float
    from_currency: str = Field(default="USD")
    to_currency: str = Field(default="MXN")


def _convert_currency(ctx: AgentContext, args: ConvertCurrencyArgs) -> ToolResult:
    try:
        import requests
        r = requests.get(f"https://open.er-api.com/v6/latest/{args.from_currency}", timeout=5)
        r.raise_for_status()
        data = r.json()
        rate = data.get("rates", {}).get(args.to_currency)
        if not rate:
            return ToolResult(ok=False, summary=f"Tasa no disponible", error="no_rate")
        converted = round(args.amount * rate, 2)
        summary = f"${args.amount:,.2f} {args.from_currency} = ${converted:,.2f} {args.to_currency} (tasa: {rate:.4f})"
        return ToolResult(ok=True, summary=summary, data={"original": args.amount, "converted": converted, "rate": rate, "from": args.from_currency, "to": args.to_currency})
    except Exception as e:
        return ToolResult(ok=False, summary=f"Error: {e}", error="api_error")


# ── Register all v2 tools ───────────────────────────────────────────────────

_acct_persona = frozenset({"accounting", "admin"})

REGISTRY.register(ToolSpec(
    name="cfdi_pair", description="Vincula un CFDI (UUID) a un gasto específico.",
    category="entity", input_schema=CfdiPairArgs, handler=_cfdi_pair, personas=_acct_persona,
))

REGISTRY.register(ToolSpec(
    name="cfdi_mass_check", description="Revisa todos los gastos aprobados y muestra cuáles tienen CFDI vinculado y cuáles no.",
    category="read", input_schema=CfdiMassCheckArgs, handler=_cfdi_mass_check, personas=_acct_persona,
))

REGISTRY.register(ToolSpec(
    name="poliza_preview", description="Previsualiza las líneas de póliza para un gasto específico (débitos/créditos).",
    category="read", input_schema=PolizaPreviewArgs, handler=_poliza_preview, personas=_acct_persona,
))

REGISTRY.register(ToolSpec(
    name="budget_vs_actual", description="Compara presupuesto vs. gasto real por centro de costo, proyecto o cliente.",
    category="read", input_schema=BudgetVsActualArgs, handler=_budget_vs_actual, personas=_acct_persona,
))

REGISTRY.register(ToolSpec(
    name="expense_trends", description="Muestra tendencias de gasto mensuales (últimos N meses).",
    category="read", input_schema=ExpenseTrendsArgs, handler=_expense_trends, personas=_acct_persona,
))

REGISTRY.register(ToolSpec(
    name="top_vendors", description="Top N proveedores por monto total de gasto.",
    category="read", input_schema=TopVendorsArgs, handler=_top_vendors, personas=_acct_persona,
))

REGISTRY.register(ToolSpec(
    name="review_queue", description="Lista gastos pendientes de revisión contable con estado de categoría y CFDI.",
    category="read", input_schema=_Empty, handler=_review_queue, personas=_acct_persona,
))

REGISTRY.register(ToolSpec(
    name="accounting_review", description="Aprueba o rechaza un gasto desde la perspectiva contable. Requiere confirmación.",
    category="entity", input_schema=AccountingReviewArgs, handler=_accounting_review,
    personas=_acct_persona, destructive=True, requires_confirmation=True,
))

REGISTRY.register(ToolSpec(
    name="month_close", description="Cierra un periodo contable: verifica pendientes, genera pólizas y exporta en formato SAT/COI/CONTPAQi. Requiere confirmación.",
    category="config", input_schema=MonthCloseArgs, handler=_month_close,
    personas=_acct_persona, destructive=True, requires_confirmation=True,
))

REGISTRY.register(ToolSpec(
    name="create_subcontractor", description="Crea un subcontratista con RFC para retenciones SAT. Requiere confirmación.",
    category="entity", input_schema=CreateSubcontractorArgs, handler=_create_subcontractor,
    personas=_acct_persona, destructive=True, requires_confirmation=True,
))

REGISTRY.register(ToolSpec(
    name="list_subcontractors", description="Lista todos los subcontratistas registrados con RFC.",
    category="read", input_schema=_Empty, handler=_list_subcontractors, personas=_acct_persona,
))

REGISTRY.register(ToolSpec(
    name="calculate_retentions", description="Calcula retenciones ISR e IVA para honorarios (subcontratistas). Muestra neto a pagar.",
    category="read", input_schema=RetentionArgs, handler=_calculate_retentions, personas=_acct_persona,
))

REGISTRY.register(ToolSpec(
    name="time_allocation_summary", description="Resumen de horas y costos por proyecto/centro de costo desde time tracking.",
    category="read", input_schema=_Empty, handler=_time_allocation_summary, personas=_acct_persona,
))

REGISTRY.register(ToolSpec(
    name="exchange_rate", description="Obtiene la tasa de cambio actual entre dos monedas (default USD→MXN).",
    category="read", input_schema=ExchangeRateArgs, handler=_exchange_rate, personas=_acct_persona,
))

REGISTRY.register(ToolSpec(
    name="convert_currency", description="Convierte un monto entre monedas usando la tasa actual.",
    category="read", input_schema=ConvertCurrencyArgs, handler=_convert_currency, personas=_acct_persona,
))
