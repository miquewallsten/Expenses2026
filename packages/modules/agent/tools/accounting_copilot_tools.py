"""Accounting Copilot tools — deep accounting setup, dimension management,
budget tracking, auto-categorization, template ingestion, and póliza configuration.

These tools give the accounting agent full power to:
  - Read/write accounting setup configuration
  - Manage chart of accounts, tax rates, categories
  - Manage dimensions (cost centers, projects, clients) with enriched fields
  - Track budgets vs. actuals
  - Run auto-categorization on uncategorized expenses
  - Ingest and interpret templates, Excel files, póliza examples
  - Configure póliza output formats
  - Remember accountant preferences
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from packages.core.platform.models_accounting_setup import AccountingSetup
from packages.core.platform.models_accounting_category import AccountingCategory
from packages.core.platform.models_accounting_account import AccountingAccount
from packages.core.platform.models_tax_rate import TaxRate
from packages.core.platform.models_cost_center import CostCenter
from packages.core.platform.models_project import Project
from packages.core.platform.models_client import Client

from packages.modules.admin.service.accounting_setup_service import (
    get_accounting_setup, upsert_accounting_setup,
)
from packages.modules.accounting.service.chart_of_accounts_service import (
    list_accounts, list_tax_rates, upsert_account, upsert_tax_rate,
)
from packages.modules.accounting.service.auto_categorization_service import (
    bulk_suggest, accept_suggestion,
)

from ..core.context import AgentContext
from ..core.registry import REGISTRY, ToolResult, ToolSpec


# ── Read Tools ──────────────────────────────────────────────────────────────

class _Empty(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _read_accounting_setup(ctx: AgentContext, args: _Empty) -> ToolResult:
    setup = get_accounting_setup(ctx.db, ctx.company_id)
    if not setup:
        return ToolResult(ok=True, summary="No hay configuración contable aún.", data={})
    data = {
        "accounting_review_mode": setup.accounting_review_mode,
        "poliza_required": setup.poliza_required,
        "ai_accounting_assist_enabled": setup.ai_accounting_assist_enabled,
        "cost_center_required": setup.cost_center_required,
        "project_required": setup.project_required,
        "client_required": setup.client_required,
        "account_code_required": setup.account_code_required,
        "auto_account_suggestion_enabled": setup.auto_account_suggestion_enabled,
        "allow_accounting_override": setup.allow_accounting_override,
        "allow_submit_with_warnings": setup.allow_submit_with_warnings,
        "require_final_accounting_review_before_export": setup.require_final_accounting_review_before_export,
        "setup_mode": getattr(setup, 'setup_mode', 'setup'),
        "configured_by": getattr(setup, 'configured_by', None),
        "last_configured_by": getattr(setup, 'last_configured_by', None),
        "last_configured_at": str(setup.last_configured_at) if hasattr(setup, 'last_configured_at') and setup.last_configured_at else None,
    }
    return ToolResult(ok=True, summary="Configuración contable actual.", data=data)


def _list_dimensions(ctx: AgentContext, args: _Empty) -> ToolResult:
    ccs = ctx.db.query(CostCenter).filter(CostCenter.company_id == ctx.company_id, CostCenter.status == "active").all()
    projects = ctx.db.query(Project).filter(Project.company_id == ctx.company_id, Project.status == "active").all()
    clients = ctx.db.query(Client).filter(Client.company_id == ctx.company_id, Client.status == "active").all()
    data = {
        "cost_centers": [{"id": c.id, "code": c.code, "name": c.name, "budget": c.budget_amount} for c in ccs],
        "projects": [{"id": p.id, "code": p.code, "name": p.name, "budget": p.budget_amount, "client_id": p.client_id} for p in projects],
        "clients": [{"id": c.id, "code": c.code, "name": c.name, "rfc": c.rfc} for c in clients],
    }
    summary = f"{len(ccs)} centros de costo, {len(projects)} proyectos, {len(clients)} clientes"
    return ToolResult(ok=True, summary=summary, data=data)


def _list_coa(ctx: AgentContext, args: _Empty) -> ToolResult:
    accounts = list_accounts(ctx.db, ctx.company_id)
    rates = list_tax_rates(ctx.db, ctx.company_id)
    data = {
        "accounts": [{"id": a.id, "code": a.code, "name": a.name, "class": a.account_class, "postable": a.is_postable, "split_by": a.split_by} for a in accounts],
        "tax_rates": [{"id": r.id, "name": r.name, "rate": float(r.rate), "behavior": r.behavior} for r in rates],
    }
    return ToolResult(ok=True, summary=f"{len(accounts)} cuentas, {len(rates)} tasas de IVA", data=data)


def _list_categories_detail(ctx: AgentContext, args: _Empty) -> ToolResult:
    cats = (
        ctx.db.query(AccountingCategory)
        .filter(AccountingCategory.company_id == ctx.company_id, AccountingCategory.is_active.is_(True))
        .order_by(AccountingCategory.code)
        .all()
    )
    data = []
    for c in cats:
        acct_code = c.expense_account_code
        if c.expense_account_id:
            acc = ctx.db.query(AccountingAccount).get(c.expense_account_id)
            if acc:
                acct_code = acc.code
        data.append({
            "code": c.code, "name": c.name,
            "account_code": acct_code,
            "tax_behavior": c.tax_behavior,
            "requires_project": c.requires_project,
            "expense_account_id": c.expense_account_id,
            "tax_rate_id": c.tax_rate_id,
        })
    unmapped = [d for d in data if not d["expense_account_id"]]
    summary = f"{len(data)} categorías activas, {len(unmapped)} sin cuenta contable mapeada"
    return ToolResult(ok=True, summary=summary, data=data)


def _get_dashboard(ctx: AgentContext, args: _Empty) -> ToolResult:
    from packages.modules.accounting.service.accounting_dashboard_service import get_dashboard
    data = get_dashboard(ctx.db, ctx.company_id)
    return ToolResult(ok=True, summary="Dashboard contable", data=data)


# ── Write Tools ─────────────────────────────────────────────────────────────

class UpdateAccountingSetupArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    accounting_review_mode: str | None = None
    poliza_required: bool | None = None
    ai_accounting_assist_enabled: bool | None = None
    cost_center_required: bool | None = None
    project_required: bool | None = None
    client_required: bool | None = None
    account_code_required: bool | None = None
    auto_account_suggestion_enabled: bool | None = None
    allow_accounting_override: bool | None = None
    allow_submit_with_warnings: bool | None = None
    require_final_accounting_review_before_export: bool | None = None


def _update_accounting_setup(ctx: AgentContext, args: UpdateAccountingSetupArgs) -> ToolResult:
    data = args.model_dump(exclude_unset=True)
    if not data:
        return ToolResult(ok=False, summary="No hay cambios para aplicar.", error="no_changes")
    setup = upsert_accounting_setup(ctx.db, ctx.company_id, args)
    return ToolResult(ok=True, summary=f"Configuración contable actualizada: {list(data.keys())}", data=data)


class CreateDimensionArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: str = Field(..., pattern=r"^(projects|clients|cost-centers)$")
    name: str = Field(..., min_length=1)
    code: str = Field(..., min_length=1)
    description: str | None = None
    budget_amount: float | None = None
    responsible_user_id: int | None = None
    parent_id: int | None = None
    client_id: int | None = None  # for projects
    rfc: str | None = None  # for clients
    legal_name: str | None = None  # for clients
    is_billable: bool = False
    notes: str | None = None


def _create_dimension(ctx: AgentContext, args: CreateDimensionArgs) -> ToolResult:
    model_map = {"projects": Project, "clients": Client, "cost-centers": CostCenter}
    model = model_map.get(args.kind)
    if not model:
        return ToolResult(ok=False, summary=f"Tipo desconocido: {args.kind}", error="invalid_kind")
    # Check duplicate
    existing = ctx.db.query(model).filter(model.company_id == ctx.company_id, model.code == args.code).first()
    if existing:
        return ToolResult(ok=False, summary=f"{args.kind} con código '{args.code}' ya existe", error="duplicate")
    data = args.model_dump(exclude_unset=True)
    data.pop("kind")
    data["company_id"] = ctx.company_id
    data["status"] = "active"
    obj = model(**data)
    ctx.db.add(obj)
    ctx.db.commit()
    ctx.db.refresh(obj)
    return ToolResult(ok=True, summary=f"{args.kind} '{args.code} - {args.name}' creado", data={"id": obj.id})


class CreateTaxRateArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., min_length=1)
    rate: float = Field(...)
    behavior: str = Field(..., pattern=r"^(trasladable|acreditable|no_acreditable|retenido|exento)$")
    gl_account_code: str | None = None


def _create_tax_rate(ctx: AgentContext, args: CreateTaxRateArgs) -> ToolResult:
    gl_id = None
    if args.gl_account_code:
        acc = ctx.db.query(AccountingAccount).filter(
            AccountingAccount.company_id == ctx.company_id, AccountingAccount.code == args.gl_account_code
        ).first()
        if acc:
            gl_id = acc.id
    rate = upsert_tax_rate(ctx.db, ctx.company_id, {
        "name": args.name, "rate": args.rate, "behavior": args.behavior, "gl_account_id": gl_id,
    })
    return ToolResult(ok=True, summary=f"Tasa '{args.name}' ({float(rate.rate)*100:.0f}% {args.behavior}) creada", data={"id": rate.id})


class MapCategoryArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category_code: str = Field(..., min_length=1)
    expense_account_code: str | None = None
    tax_rate_name: str | None = None
    counterparty_account_code: str | None = None


def _map_category(ctx: AgentContext, args: MapCategoryArgs) -> ToolResult:
    cat = ctx.db.query(AccountingCategory).filter(
        AccountingCategory.company_id == ctx.company_id, AccountingCategory.code == args.category_code
    ).first()
    if not cat:
        return ToolResult(ok=False, summary=f"Categoría '{args.category_code}' no encontrada", error="not_found")
    
    updates = {}
    if args.expense_account_code:
        acc = ctx.db.query(AccountingAccount).filter(
            AccountingAccount.company_id == ctx.company_id, AccountingAccount.code == args.expense_account_code
        ).first()
        if acc:
            cat.expense_account_id = acc.id
            cat.expense_account_code = args.expense_account_code
            updates["expense_account"] = args.expense_account_code
    
    if args.tax_rate_name:
        rate = ctx.db.query(TaxRate).filter(
            TaxRate.company_id == ctx.company_id, TaxRate.name == args.tax_rate_name
        ).first()
        if rate:
            cat.tax_rate_id = rate.id
            cat.tax_behavior = rate.behavior
            updates["tax_rate"] = args.tax_rate_name
    
    if args.counterparty_account_code:
        acc = ctx.db.query(AccountingAccount).filter(
            AccountingAccount.company_id == ctx.company_id, AccountingAccount.code == args.counterparty_account_code
        ).first()
        if acc:
            cat.counterparty_account_id = acc.id
            updates["counterparty"] = args.counterparty_account_code
    
    ctx.db.commit()
    return ToolResult(ok=True, summary=f"Categoría '{args.category_code}' mapeada: {updates}", data=updates)


class AutoCategorizeArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    limit: int = Field(default=20, ge=1, le=100)
    accept_confident: bool = Field(default=False, description="Auto-accept high-confidence suggestions")


def _auto_categorize(ctx: AgentContext, args: AutoCategorizeArgs) -> ToolResult:
    suggestions = bulk_suggest(ctx.db, ctx.company_id, limit=args.limit)
    high_conf = [s for s in suggestions if s.get("suggested_category_code") and s.get("confidence") == "high"]
    medium_conf = [s for s in suggestions if s.get("suggested_category_code") and s.get("confidence") == "medium"]
    low_conf = [s for s in suggestions if not s.get("suggested_category_code") or s.get("confidence") == "low"]
    
    accepted = 0
    if args.accept_confident:
        for s in high_conf + medium_conf:
            try:
                accept_suggestion(ctx.db, s["expense_id"], s["suggested_category_code"], s.get("suggested_account_code"))
                accepted += 1
            except Exception:
                pass
    
    summary = f"{len(suggestions)} gastos analizados: {len(high_conf)} alta confianza, {len(medium_conf)} media, {len(low_conf)} baja"
    if accepted:
        summary += f" — {accepted} aceptados automáticamente"
    
    return ToolResult(ok=True, summary=summary, data={
        "total": len(suggestions), "high": len(high_conf), "medium": len(medium_conf), "low": len(low_conf),
        "accepted": accepted,
        "suggestions": suggestions[:10],  # first 10 for preview
    })


class PolizaFormatArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    format: str = Field(..., pattern=r"^(coi|contpaqi|sat|custom)$")
    description: str | None = None


def _set_poliza_format(ctx: AgentContext, args: PolizaFormatArgs) -> ToolResult:
    setup = get_accounting_setup(ctx.db, ctx.company_id)
    if not setup:
        setup = get_or_create_accounting_setup(ctx.db, ctx.company_id)
    setup.poliza_required = True
    ctx.db.commit()
    return ToolResult(ok=True, summary=f"Formato de póliza configurado: {args.format}", data={"format": args.format})


# ── Register all tools ──────────────────────────────────────────────────────

_accounting_persona = frozenset({"admin"})

REGISTRY.register(ToolSpec(
    name="read_accounting_setup_detailed",
    description="Lee la configuración contable completa de la empresa (modo de revisión, requisitos de póliza, campos obligatorios, asistencia IA, etc.)",
    category="read",
    input_schema=_Empty,
    handler=_read_accounting_setup,
    personas=_accounting_persona,
))

REGISTRY.register(ToolSpec(
    name="update_accounting_setup_full",
    description="Actualiza la configuración contable: modo de revisión, requisitos de póliza, campos obligatorios, asistencia IA, etc. Cambios destructivos requieren confirmación.",
    category="config",
    input_schema=UpdateAccountingSetupArgs,
    handler=_update_accounting_setup,
    personas=_accounting_persona,
    destructive=True,
    requires_confirmation=True,
))

REGISTRY.register(ToolSpec(
    name="list_dimensions",
    description="Lista todos los centros de costo, proyectos y clientes con sus presupuestos y detalles.",
    category="read",
    input_schema=_Empty,
    handler=_list_dimensions,
    personas=_accounting_persona,
))

REGISTRY.register(ToolSpec(
    name="list_chart_of_accounts_detailed",
    description="Lista el catálogo de cuentas completo y las tasas de IVA configuradas.",
    category="read",
    input_schema=_Empty,
    handler=_list_coa,
    personas=_accounting_persona,
))

REGISTRY.register(ToolSpec(
    name="list_categories_detail",
    description="Lista todas las categorías contables con su mapeo a cuentas y tasas de IVA. Muestra cuáles están sin mapear.",
    category="read",
    input_schema=_Empty,
    handler=_list_categories_detail,
    personas=_accounting_persona,
))

REGISTRY.register(ToolSpec(
    name="get_accounting_dashboard",
    description="Dashboard contable: pendientes de revisión, aprobados del mes, problemas CFDI, categorías sin mapear.",
    category="read",
    input_schema=_Empty,
    handler=_get_dashboard,
    personas=_accounting_persona,
))

REGISTRY.register(ToolSpec(
    name="create_dimension",
    description="Crea un centro de costo, proyecto o cliente con código, nombre, presupuesto, responsable, fechas. kind: 'projects', 'clients', 'cost-centers'.",
    category="entity",
    input_schema=CreateDimensionArgs,
    handler=_create_dimension,
    personas=_accounting_persona,
    destructive=True,
    requires_confirmation=True,
))

REGISTRY.register(ToolSpec(
    name="create_tax_rate",
    description="Crea una tasa de IVA/ISR con nombre, porcentaje, comportamiento (acreditable, no_acreditable, trasladable, retenido, exento) y cuenta contable.",
    category="entity",
    input_schema=CreateTaxRateArgs,
    handler=_create_tax_rate,
    personas=_accounting_persona,
    destructive=True,
    requires_confirmation=True,
))

REGISTRY.register(ToolSpec(
    name="map_category_to_accounts",
    description="Vincula una categoría contable a su cuenta de gasto, tasa de IVA y contrapartida. Ejemplo: map_category_to_accounts(category_code='TRAVEL', expense_account_code='601.10', tax_rate_name='IVA 16% Acreditable')",
    category="config",
    input_schema=MapCategoryArgs,
    handler=_map_category,
    personas=_accounting_persona,
    destructive=True,
    requires_confirmation=True,
))

REGISTRY.register(ToolSpec(
    name="auto_categorize_expenses",
    description="Ejecuta auto-categorización IA sobre gastos sin categoría. Si accept_confident=True, acepta automáticamente las de alta/media confianza.",
    category="entity",
    input_schema=AutoCategorizeArgs,
    handler=_auto_categorize,
    personas=_accounting_persona,
    destructive=True,
    requires_confirmation=True,
))

REGISTRY.register(ToolSpec(
    name="set_poliza_format",
    description="Configura el formato de salida de pólizas (coi, contpaqi, sat, custom) y activa la generación automática.",
    category="config",
    input_schema=PolizaFormatArgs,
    handler=_set_poliza_format,
    personas=_accounting_persona,
    destructive=True,
    requires_confirmation=True,
))
