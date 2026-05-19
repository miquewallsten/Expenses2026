"""Accounting Copilot Tools v3 — Intelligence, health, fiscal calendar, custom rules,
anomaly detection, smart closing, vendor management, change impact, exchange rate cache.

These tools make the accounting copilot a truly intelligent assistant that:
  - Knows the fiscal calendar and proactively warns about deadlines
  - Detects anomalies and policy violations automatically
  - Manages custom business rules defined by the accountant
  - Runs comprehensive health checks
  - Provides smart closing checklists
  - Manages vendors with RFC and retention rules
  - Analyzes the impact of configuration changes before applying them
  - Caches exchange rates for reliable multi-currency support
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from ..core.context import AgentContext
from ..core.registry import REGISTRY, ToolResult, ToolSpec


class _Empty(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ═══════════════════════════════════════════════════════════════════════════
# HEALTH & INTELLIGENCE
# ═══════════════════════════════════════════════════════════════════════════

def _accounting_health(ctx: AgentContext, _: _Empty) -> ToolResult:
    from packages.modules.accounting.service.accounting_health_service import full_health_check
    result = full_health_check(ctx.db, ctx.company_id)
    return ToolResult(ok=True,
        summary=f"Salud contable: {result['health_score']}/100 ({result['overall']})",
        data=result)


def _scan_insights(ctx: AgentContext, _: _Empty) -> ToolResult:
    from packages.modules.accounting.service.accounting_insight_scanner import scan_all
    insights = scan_all(ctx.db, ctx.company_id)
    return ToolResult(ok=True,
        summary=f"{len(insights)} nuevos hallazgos proactivos",
        data={"count": len(insights), "insights": [
            {"kind": i.kind, "severity": i.severity, "title": i.title, "body": i.body}
            for i in insights
        ]})


def _detect_anomalies(ctx: AgentContext, _: _Empty) -> ToolResult:
    from packages.modules.accounting.service.anomaly_detection_service import run_full_scan
    findings = run_full_scan(ctx.db, ctx.company_id)
    return ToolResult(ok=True,
        summary=f"{len(findings)} anomalías detectadas",
        data={"findings": findings, "count": len(findings)})


# ═══════════════════════════════════════════════════════════════════════════
# FISCAL CALENDAR
# ═══════════════════════════════════════════════════════════════════════════

class FiscalDeadlinesArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    months_ahead: int = Field(default=3, ge=1, le=12)


def _list_fiscal_deadlines(ctx: AgentContext, args: FiscalDeadlinesArgs) -> ToolResult:
    from packages.modules.accounting.service.fiscal_calendar_service import get_upcoming_deadlines
    deadlines = get_upcoming_deadlines(ctx.db, ctx.company_id, months_ahead=args.months_ahead)
    critical = [d for d in deadlines if d["urgency"] == "critical"]
    summary = f"{len(deadlines)} fechas próximas"
    if critical:
        summary += f" ({len(critical)} críticas)"
    return ToolResult(ok=True, summary=summary, data={"deadlines": deadlines})


def _get_current_period(ctx: AgentContext, _: _Empty) -> ToolResult:
    from packages.modules.accounting.service.fiscal_calendar_service import get_current_period
    result = get_current_period(ctx.db, ctx.company_id)
    return ToolResult(ok=True,
        summary=f"Período actual: {result['current_period']} (FY {result['fiscal_year']}, {result['fy_progress_pct']}% completado)",
        data=result)


# ═══════════════════════════════════════════════════════════════════════════
# CUSTOM RULES
# ═══════════════════════════════════════════════════════════════════════════

class CreateRuleArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., min_length=1, max_length=255)
    trigger: str = Field(..., pattern=r"^(expense\.submitted|expense\.approved|cfdi\.matched|month_close)$")
    condition: dict[str, Any] = Field(default_factory=dict,
        description="Condition: {field, operator, value} or {logic:'all'|'any', rules:[{field,op,val}]}")
    action: dict[str, Any] = Field(...,
        description="Action: {type:'set_account'|'set_category'|'set_tax_behavior'|'split_tax'|'require_approval'|'flag'|'notify', ...}")
    description: str | None = None
    priority: int = Field(default=100, ge=1, le=999)


def _create_accounting_rule(ctx: AgentContext, args: CreateRuleArgs) -> ToolResult:
    from packages.modules.accounting.service.custom_rule_service import create_rule
    rule = create_rule(ctx.db, company_id=ctx.company_id, name=args.name,
        trigger=args.trigger, condition=args.condition, action=args.action,
        description=args.description, priority=args.priority, created_by=ctx.user_id)
    return ToolResult(ok=True,
        summary=f"Regla '{args.name}' creada (trigger: {args.trigger})",
        data={"rule_id": rule.id, "name": rule.name, "trigger": rule.trigger})


class ListRulesArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    active_only: bool = True


def _list_accounting_rules(ctx: AgentContext, args: ListRulesArgs) -> ToolResult:
    from packages.modules.accounting.service.custom_rule_service import list_all_rules_with_policies
    result = list_all_rules_with_policies(ctx.db, ctx.company_id)
    automation = result["automation"]
    validation = result["validation"]
    return ToolResult(ok=True,
        summary=f"{len(automation)} automatizaciones, {len(validation)} políticas de validación",
        data={"automation": automation, "validation": validation,
            "note": "Las reglas de automatización ejecutan acciones (set_account, split_tax). Las políticas de validación bloquean o advierten (block/warn). Ambas se muestran en el panel Rules & Policies del Admin."})


class MatchRulesArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    trigger: str = Field(..., pattern=r"^(expense\.submitted|expense\.approved|cfdi\.matched|month_close)$")
    context: dict[str, Any] = Field(default_factory=dict)


def _match_rules(ctx: AgentContext, args: MatchRulesArgs) -> ToolResult:
    from packages.modules.accounting.service.custom_rule_service import match_rules
    matched = match_rules(ctx.db, ctx.company_id, args.trigger, args.context)
    return ToolResult(ok=True,
        summary=f"{len(matched)} reglas coinciden",
        data={"matched": matched})


class DeleteRuleArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rule_id: int


def _delete_accounting_rule(ctx: AgentContext, args: DeleteRuleArgs) -> ToolResult:
    from packages.modules.accounting.service.custom_rule_service import delete_rule
    ok = delete_rule(ctx.db, args.rule_id)
    return ToolResult(ok=ok,
        summary=f"Regla {args.rule_id} desactivada" if ok else f"Regla {args.rule_id} no encontrada")


# ═══════════════════════════════════════════════════════════════════════════
# SMART CLOSING
# ═══════════════════════════════════════════════════════════════════════════

class ClosePeriodArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    period: str = Field(..., pattern=r"^\d{4}-\d{2}$", description="YYYY-MM")


def _pre_close_checklist(ctx: AgentContext, args: ClosePeriodArgs) -> ToolResult:
    from packages.modules.accounting.service.smart_closing_service import pre_close_checklist
    result = pre_close_checklist(ctx.db, ctx.company_id, period=args.period)
    status = "✓ listo para cerrar" if result["can_close"] else f"✗ {result['blocking_count']} bloqueos"
    return ToolResult(ok=True, summary=f"Checklist {args.period}: {status}", data=result)


def _close_accounting_period(ctx: AgentContext, args: ClosePeriodArgs) -> ToolResult:
    from packages.modules.accounting.service.smart_closing_service import lock_period
    result = lock_period(ctx.db, ctx.company_id, args.period)
    if result["locked"]:
        return ToolResult(ok=True, summary=f"Período {args.period} cerrado y bloqueado", data=result)
    return ToolResult(ok=False,
        summary=f"No se puede cerrar {args.period}: {result.get('reason', '')}",
        data=result)


class IsPeriodLockedArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    period: str = Field(..., pattern=r"^\d{4}-\d{2}$")


def _is_period_locked(ctx: AgentContext, args: IsPeriodLockedArgs) -> ToolResult:
    from packages.modules.accounting.service.smart_closing_service import is_period_locked
    locked = is_period_locked(ctx.db, ctx.company_id, args.period)
    return ToolResult(ok=True,
        summary=f"Período {args.period}: {'cerrado' if locked else 'abierto'}",
        data={"period": args.period, "locked": locked})


# ═══════════════════════════════════════════════════════════════════════════
# VENDOR MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════

class CreateVendorArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., min_length=1, max_length=255)
    rfc: str | None = None
    legal_name: str | None = None
    vendor_type: str = Field(default="supplier", pattern=r"^(supplier|subcontractor|freelancer)$")
    payment_terms_days: int = Field(default=30, ge=0)
    isr_retention_pct: float = Field(default=0.0, ge=0, le=100)
    iva_retention_pct: float = Field(default=0.0, ge=0, le=100)
    default_category_code: str | None = None
    default_account_code: str | None = None
    notes: str | None = None


def _create_vendor(ctx: AgentContext, args: CreateVendorArgs) -> ToolResult:
    from packages.modules.accounting.service.vendor_service import create_vendor
    v = create_vendor(ctx.db, company_id=ctx.company_id, name=args.name,
        rfc=args.rfc, legal_name=args.legal_name, vendor_type=args.vendor_type,
        payment_terms_days=args.payment_terms_days, isr_retention_pct=args.isr_retention_pct,
        iva_retention_pct=args.iva_retention_pct, default_category_code=args.default_category_code,
        default_account_code=args.default_account_code, notes=args.notes)
    return ToolResult(ok=True,
        summary=f"Proveedor '{args.name}' creado ({args.vendor_type})",
        data={"vendor_id": v.id, "name": v.name, "rfc": v.rfc})


class ListVendorsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    vendor_type: str | None = None


def _list_vendors(ctx: AgentContext, args: ListVendorsArgs) -> ToolResult:
    from packages.modules.accounting.service.vendor_service import list_vendors
    vendors = list_vendors(ctx.db, ctx.company_id, vendor_type=args.vendor_type)
    return ToolResult(ok=True,
        summary=f"{len(vendors)} proveedores",
        data={"vendors": [{"id": v.id, "name": v.name, "rfc": v.rfc, "type": v.vendor_type,
            "isr_ret": v.isr_retention_pct, "iva_ret": v.iva_retention_pct} for v in vendors]})


# ═══════════════════════════════════════════════════════════════════════════
# CHANGE IMPACT
# ═══════════════════════════════════════════════════════════════════════════

class ExplainImpactArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    setting: str = Field(..., description="Setting name: xml_required_mode, approval_mode, accounting_review_mode, poliza_required, cost_center_required, project_required, category_mapping")
    current_value: Any = None
    new_value: Any = None


def _explain_change_impact(ctx: AgentContext, args: ExplainImpactArgs) -> ToolResult:
    from packages.modules.accounting.service.change_impact_service import analyze_impact
    result = analyze_impact(ctx.db, ctx.company_id, setting=args.setting,
        current_value=args.current_value, new_value=args.new_value)
    severity = result.get("severity", "info")
    impacts = result.get("impacts", [])
    summary = f"Impacto de cambiar {args.setting}: {len(impacts)} efectos ({severity})"
    return ToolResult(ok=True, summary=summary, data=result)


# ═══════════════════════════════════════════════════════════════════════════
# CACHED EXCHANGE RATES
# ═══════════════════════════════════════════════════════════════════════════

class CachedRateArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    from_currency: str = Field(default="USD", max_length=3)
    to_currency: str = Field(default="MXN", max_length=3)


def _get_cached_rate(ctx: AgentContext, args: CachedRateArgs) -> ToolResult:
    from packages.modules.accounting.service.exchange_rate_cache_service import get_rate
    rate = get_rate(ctx.db, args.from_currency, args.to_currency)
    if rate is None:
        return ToolResult(ok=False, summary="Tasa no disponible", error="no_rate")
    return ToolResult(ok=True,
        summary=f"1 {args.from_currency} = {rate:.4f} {args.to_currency} (cacheada)",
        data={"from": args.from_currency, "to": args.to_currency, "rate": rate})


class CachedConvertArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount: float = Field(..., gt=0)
    from_currency: str = Field(default="USD", max_length=3)
    to_currency: str = Field(default="MXN", max_length=3)


def _cached_convert(ctx: AgentContext, args: CachedConvertArgs) -> ToolResult:
    from packages.modules.accounting.service.exchange_rate_cache_service import convert_amount
    result = convert_amount(ctx.db, args.amount, args.from_currency, args.to_currency)
    if result is None:
        return ToolResult(ok=False, summary="Conversión no disponible", error="no_rate")
    return ToolResult(ok=True,
        summary=f"${args.amount:,.2f} {args.from_currency} = ${result:,.2f} {args.to_currency}",
        data={"original": args.amount, "converted": result, "from": args.from_currency, "to": args.to_currency})


# ═══════════════════════════════════════════════════════════════════════════
# FULL APP STATE SNAPSHOT
# ═══════════════════════════════════════════════════════════════════════════

def _get_full_app_state(ctx: AgentContext, _: _Empty) -> ToolResult:
    """Get a complete snapshot of all configuration state."""
    from packages.core.platform.models_company_setup import CompanySetup
    from packages.core.platform.models_expense_policy import CompanyExpensePolicy
    from packages.core.platform.models_accounting_setup import AccountingSetup
    from packages.core.platform.models_approval_setup import ApprovalSetup
    from packages.core.platform.models_auth_settings import CompanyAuthSettings
    from packages.modules.channels.models import ChannelSettings
    
    state = {}
    
    # Company setup
    cs = ctx.db.query(CompanySetup).filter(CompanySetup.company_id == ctx.company_id).first()
    if cs:
        state["company_setup"] = {
            "display_name": cs.display_name, "country_code": cs.country_code,
            "base_currency": cs.base_currency, "industry": cs.industry,
            "expenses_module_enabled": cs.expenses_module_enabled,
            "accounting_module_enabled": getattr(cs, "accounting_module_enabled", True),
            "time_allocation_module_enabled": getattr(cs, "time_allocation_module_enabled", False),
            "amex_reconciliation_module_enabled": getattr(cs, "amex_reconciliation_module_enabled", False),
            "purchase_requests_module_enabled": getattr(cs, "purchase_requests_module_enabled", False),
        }
    
    # Expense policy
    ep = ctx.db.query(CompanyExpensePolicy).filter(CompanyExpensePolicy.company_id == ctx.company_id).first()
    if ep:
        state["expense_policy"] = {
            "xml_required_mode": ep.xml_required_mode,
            "spending_limit": float(ep.spending_limit) if ep.spending_limit else None,
            "required_attachments": ep.required_attachments,
            "international_expenses_allowed": getattr(ep, "international_expenses_allowed", True),
            "wallet_enabled": getattr(ep, "wallet_enabled", False),
        }
    
    # Accounting setup
    acs = ctx.db.query(AccountingSetup).filter(AccountingSetup.company_id == ctx.company_id).first()
    if acs:
        state["accounting_setup"] = {
            "accounting_review_mode": acs.accounting_review_mode,
            "poliza_required": acs.poliza_required,
            "cost_center_required": acs.cost_center_required,
            "project_required": acs.project_required,
            "ai_accounting_assist_enabled": acs.ai_accounting_assist_enabled,
            "auto_account_suggestion_enabled": acs.auto_account_suggestion_enabled,
        }
    
    # Approval setup
    aps = ctx.db.query(ApprovalSetup).filter(ApprovalSetup.company_id == ctx.company_id).first()
    if aps:
        state["approval_setup"] = {
            "approval_mode": aps.approval_mode,
            "director_threshold": float(aps.director_threshold) if aps.director_threshold else None,
        }
    
    # Channel settings
    channels = ctx.db.query(ChannelSettings).filter(ChannelSettings.company_id == ctx.company_id).all()
    if channels:
        state["channels"] = [{"channel": c.channel, "is_enabled": c.is_enabled} for c in channels]
    
    # Auth settings
    auth = ctx.db.query(CompanyAuthSettings).filter(CompanyAuthSettings.company_id == ctx.company_id).first()
    if auth:
        state["auth"] = {"magic_link_enabled": auth.magic_link_enabled, "sso_enabled": auth.sso_enabled}
    
    return ToolResult(ok=True, summary="Estado completo de la aplicación", data=state)


# ═══════════════════════════════════════════════════════════════════════════
# MEMORY-ENHANCED TOOLS
# ═══════════════════════════════════════════════════════════════════════════

class SavePreferenceArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str = Field(..., min_length=1, max_length=255)
    value: Any


def _save_preference(ctx: AgentContext, args: SavePreferenceArgs) -> ToolResult:
    """Save an accountant preference to persistent memory."""
    from packages.modules.agent.core.memory import remember
    row = remember(ctx.db, company_id=ctx.company_id, key=args.key,
        value=args.value, kind="preference")
    return ToolResult(ok=True,
        summary=f"Preferencia guardada: {args.key}",
        data={"id": row.id, "key": args.key})


class RecallPreferenceArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str = Field(..., min_length=1, max_length=255)


def _recall_preference(ctx: AgentContext, args: RecallPreferenceArgs) -> ToolResult:
    from packages.modules.agent.core.memory import recall
    val = recall(ctx.db, company_id=ctx.company_id, key=args.key, kind="preference")
    if val is None:
        return ToolResult(ok=True, summary=f"Sin preferencia para {args.key}", data={"value": None})
    return ToolResult(ok=True, summary=f"Preferencia: {args.key}", data={"value": val})


class ListAllMemoriesArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: str | None = Field(default=None, pattern=r"^(fact|preference|decision)$")
    limit: int = Field(default=20, ge=1, le=100)


def _list_all_memories(ctx: AgentContext, args: ListAllMemoriesArgs) -> ToolResult:
    from packages.modules.agent.core.memory import list_memories
    rows = list_memories(ctx.db, company_id=ctx.company_id, kind=args.kind, limit=args.limit)
    return ToolResult(ok=True,
        summary=f"{len(rows)} memorias",
        data={"items": [{"id": r.id, "kind": r.kind, "key": r.key,
            "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]})


# ═══════════════════════════════════════════════════════════════════════════
# REGISTRATION
# ═══════════════════════════════════════════════════════════════════════════

_ACCT_ADMIN = frozenset({"admin", "accounting"})
_ADMIN_ONLY = frozenset({"admin"})

# Health & Intelligence
REGISTRY.register(ToolSpec(name="accounting_health_check",
    description="Ejecuta un chequeo completo de salud contable (0-100 score). Muestra configuración faltante y recomendaciones.",
    category="read", input_schema=_Empty, handler=_accounting_health, personas=_ACCT_ADMIN))

REGISTRY.register(ToolSpec(name="scan_proactive_insights",
    description="Escanea y genera hallazgos proactivos: categorías sin mapeo, CFDIs faltantes, presupuestos excedidos, aprobaciones estancadas, fechas SAT.",
    category="read", input_schema=_Empty, handler=_scan_insights, personas=_ACCT_ADMIN))

REGISTRY.register(ToolSpec(name="detect_anomalies",
    description="Detecta anomalías: gastos duplicados, patrones inusuales, violaciones de política, gastos en fin de semana, proveedores frecuentes.",
    category="read", input_schema=_Empty, handler=_detect_anomalies, personas=_ACCT_ADMIN))

# Fiscal Calendar
REGISTRY.register(ToolSpec(name="list_fiscal_deadlines",
    description="Lista fechas límite SAT próximas (ISR provisional, DIOT, declaración anual, contabilidad electrónica). Muestra urgencia.",
    category="read", input_schema=FiscalDeadlinesArgs, handler=_list_fiscal_deadlines, personas=_ACCT_ADMIN))

REGISTRY.register(ToolSpec(name="get_current_period",
    description="Contexto del período fiscal actual: año fiscal, mes, progreso, fechas de inicio/fin.",
    category="read", input_schema=_Empty, handler=_get_current_period, personas=_ACCT_ADMIN))

# Custom Rules
REGISTRY.register(ToolSpec(name="create_accounting_rule",
    description="Crea una regla de AUTOMATIZACIÓN contable (set_account, split_tax, etc.). Para reglas de VALIDACIÓN (block/warn), usa create_ai_policy. Las reglas block/warn aquí se sincronizan automáticamente con AIPolicy. Requiere confirmación.",
    category="config", input_schema=CreateRuleArgs, handler=_create_accounting_rule,
    personas=_ACCT_ADMIN, destructive=True, requires_confirmation=True))

REGISTRY.register(ToolSpec(name="list_accounting_rules",
    description="Lista reglas de automatización contable Y políticas de validación (AIPolicy). Usa esto para ver TODAS las reglas que aplican, no solo las de automatización.",
    category="read", input_schema=ListRulesArgs, handler=_list_accounting_rules, personas=_ACCT_ADMIN))

REGISTRY.register(ToolSpec(name="match_accounting_rules",
    description="Evalúa qué reglas de automatización Y políticas de validación coinciden con un gasto/contexto. Incluye cross-reference con AIPolicy para block/warn.",
    category="read", input_schema=MatchRulesArgs, handler=_match_rules, personas=_ACCT_ADMIN))

REGISTRY.register(ToolSpec(name="delete_accounting_rule",
    description="Desactiva una regla contable personalizada. Requiere confirmación.",
    category="config", input_schema=DeleteRuleArgs, handler=_delete_accounting_rule,
    personas=_ACCT_ADMIN, destructive=True, requires_confirmation=True))

# Smart Closing
REGISTRY.register(ToolSpec(name="pre_close_checklist",
    description="Ejecuta el checklist de pre-cierre para un período (categorización, CFDI, aprobaciones, mapeo contable, presupuesto, anomalías).",
    category="read", input_schema=ClosePeriodArgs, handler=_pre_close_checklist, personas=_ACCT_ADMIN))

REGISTRY.register(ToolSpec(name="close_accounting_period",
    description="Cierra y bloquea un período contable. No se pueden agregar más gastos. Requiere confirmación.",
    category="config", input_schema=ClosePeriodArgs, handler=_close_accounting_period,
    personas=_ACCT_ADMIN, destructive=True, requires_confirmation=True))

REGISTRY.register(ToolSpec(name="is_period_locked",
    description="Verifica si un período contable está cerrado/bloqueado.",
    category="read", input_schema=IsPeriodLockedArgs, handler=_is_period_locked, personas=_ACCT_ADMIN))

# Vendors
REGISTRY.register(ToolSpec(name="create_vendor",
    description="Crea un proveedor con RFC, términos de pago y reglas de retención ISR/IVA. Requiere confirmación.",
    category="entity", input_schema=CreateVendorArgs, handler=_create_vendor,
    personas=_ACCT_ADMIN, destructive=True, requires_confirmation=True))

REGISTRY.register(ToolSpec(name="list_vendors",
    description="Lista proveedores con RFC y reglas de retención.",
    category="read", input_schema=ListVendorsArgs, handler=_list_vendors, personas=_ACCT_ADMIN))

# Change Impact
REGISTRY.register(ToolSpec(name="explain_change_impact",
    description="Analiza el impacto de cambiar una configuración antes de aplicarla. Muestra gastos afectados, advertencias y severidad.",
    category="read", input_schema=ExplainImpactArgs, handler=_explain_change_impact, personas=_ADMIN_ONLY))

# Cached Exchange Rates
REGISTRY.register(ToolSpec(name="get_cached_exchange_rate",
    description="Obtiene tasa de cambio cacheada (evita límites de API). Busca en cache primero, luego en API.",
    category="read", input_schema=CachedRateArgs, handler=_get_cached_rate, personas=_ACCT_ADMIN))

REGISTRY.register(ToolSpec(name="cached_currency_convert",
    description="Convierte monto entre monedas usando tasa cacheada.",
    category="read", input_schema=CachedConvertArgs, handler=_cached_convert, personas=_ACCT_ADMIN))

# Full App State
REGISTRY.register(ToolSpec(name="get_full_app_state",
    description="Snapshot completo de toda la configuración de la aplicación. Usa antes de hacer cambios para entender el estado actual.",
    category="read", input_schema=_Empty, handler=_get_full_app_state, personas=_ADMIN_ONLY))

# Enhanced Memory
REGISTRY.register(ToolSpec(name="save_accounting_preference",
    description="Guarda una preferencia contable persistente (formato póliza, tratamiento IVA, reglas por proveedor, etc.). El agente la recuerda entre sesiones.",
    category="memory", input_schema=SavePreferenceArgs, handler=_save_preference, personas=_ACCT_ADMIN))

REGISTRY.register(ToolSpec(name="recall_accounting_preference",
    description="Recupera una preferencia contable guardada previamente.",
    category="memory", input_schema=RecallPreferenceArgs, handler=_recall_preference, personas=_ACCT_ADMIN))

REGISTRY.register(ToolSpec(name="list_all_memories",
    description="Lista todas las memorias (hechos, preferencias, decisiones) de la empresa.",
    category="memory", input_schema=ListAllMemoriesArgs, handler=_list_all_memories, personas=_ACCT_ADMIN))
