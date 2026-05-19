"""Accounting intelligence API — health, insights, anomalies, fiscal calendar, rules, closing, vendors."""
from __future__ import annotations
from typing import Any
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_permission
from apps.api.deps import get_db
from packages.core.platform.models_user import User

router = APIRouter(
    prefix="/accounting/intelligence",
    tags=["accounting-intelligence"],
    dependencies=[Depends(require_permission("accounting:configure"))],
)


@router.get("/health")
def accounting_health(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from packages.modules.accounting.service.accounting_health_service import full_health_check
    return full_health_check(db, current_user.company_id)


@router.post("/scan-insights")
def scan_insights(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from packages.modules.accounting.service.accounting_insight_scanner import scan_all
    insights = scan_all(db, current_user.company_id)
    return {"count": len(insights), "insights": [
        {"kind": i.kind, "severity": i.severity, "title": i.title, "body": i.body} for i in insights
    ]}


@router.get("/anomalies")
def detect_anomalies(db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
    days_back: int = Query(default=90, ge=1, le=365)):
    from packages.modules.accounting.service.anomaly_detection_service import run_full_scan
    findings = run_full_scan(db, current_user.company_id, days_back=days_back)
    return {"findings": findings, "count": len(findings)}


@router.get("/fiscal-deadlines")
def fiscal_deadlines(db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
    months_ahead: int = Query(default=3, ge=1, le=12)):
    from packages.modules.accounting.service.fiscal_calendar_service import get_upcoming_deadlines
    return {"deadlines": get_upcoming_deadlines(db, current_user.company_id, months_ahead=months_ahead)}


@router.get("/current-period")
def current_period(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from packages.modules.accounting.service.fiscal_calendar_service import get_current_period
    return get_current_period(db, current_user.company_id)


@router.get("/rules")
def list_rules_route(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from packages.modules.accounting.service.custom_rule_service import list_all_rules_with_policies
    return list_all_rules_with_policies(db, current_user.company_id)


@router.post("/rules")
def create_rule_route(name: str, trigger: str, condition: dict[str, Any], action: dict[str, Any],
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
    description: str | None = None, priority: int = 100):
    from packages.modules.accounting.service.custom_rule_service import create_rule
    rule = create_rule(db, company_id=current_user.company_id, name=name, trigger=trigger,
        condition=condition, action=action, description=description,
        priority=priority, created_by=current_user.id)
    return {"id": rule.id, "name": rule.name, "trigger": rule.trigger}


@router.delete("/rules/{rule_id}")
def deactivate_rule(rule_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from packages.modules.accounting.service.custom_rule_service import delete_rule
    ok = delete_rule(db, rule_id)
    return {"deleted": ok}


@router.get("/pre-close-checklist")
def pre_close_checklist(period: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from packages.modules.accounting.service.smart_closing_service import pre_close_checklist
    return pre_close_checklist(db, current_user.company_id, period=period)


@router.post("/close-period")
def close_period(period: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from packages.modules.accounting.service.smart_closing_service import lock_period
    return lock_period(db, current_user.company_id, period)


@router.get("/is-period-locked")
def is_period_locked(period: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from packages.modules.accounting.service.smart_closing_service import is_period_locked
    return {"period": period, "locked": is_period_locked(db, current_user.company_id, period)}


@router.get("/vendors")
def list_vendors_route(vendor_type: str | None = Query(default=None),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from packages.modules.accounting.service.vendor_service import list_vendors
    vendors = list_vendors(db, current_user.company_id, vendor_type=vendor_type)
    return {"vendors": [{"id": v.id, "name": v.name, "rfc": v.rfc, "type": v.vendor_type,
        "isr_ret": v.isr_retention_pct, "iva_ret": v.iva_retention_pct,
        "default_category": v.default_category_code, "default_account": v.default_account_code} for v in vendors]}


@router.post("/vendors")
def create_vendor_route(name: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
    rfc: str | None = None, legal_name: str | None = None,
    vendor_type: str = "supplier", payment_terms_days: int = 30,
    isr_retention_pct: float = 0.0, iva_retention_pct: float = 0.0,
    default_category_code: str | None = None, default_account_code: str | None = None,
    notes: str | None = None):
    from packages.modules.accounting.service.vendor_service import create_vendor
    v = create_vendor(db, company_id=current_user.company_id, name=name, rfc=rfc,
        legal_name=legal_name, vendor_type=vendor_type, payment_terms_days=payment_terms_days,
        isr_retention_pct=isr_retention_pct, iva_retention_pct=iva_retention_pct,
        default_category_code=default_category_code, default_account_code=default_account_code, notes=notes)
    return {"id": v.id, "name": v.name, "rfc": v.rfc}


@router.get("/change-impact")
def change_impact(setting: str, current_value: Any = None, new_value: Any = None,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from packages.modules.accounting.service.change_impact_service import analyze_impact
    return analyze_impact(db, current_user.company_id, setting=setting,
        current_value=current_value, new_value=new_value)


@router.get("/cached-exchange-rate")
def cached_rate(from_currency: str = "USD", to_currency: str = "MXN",
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from packages.modules.accounting.service.exchange_rate_cache_service import get_rate
    rate = get_rate(db, from_currency, to_currency)
    if rate is None:
        return {"rate": None, "error": "unavailable"}
    return {"from": from_currency, "to": to_currency, "rate": rate}
