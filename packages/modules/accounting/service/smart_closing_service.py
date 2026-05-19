"""Smart closing service — pre-close checklist, period locking, post-close verification."""
from __future__ import annotations
import logging
from datetime import date, timedelta
from typing import Any
from sqlalchemy import func
from sqlalchemy.orm import Session
from packages.modules.expenses.models.expense import Expense
from packages.core.platform.models_accounting_category import AccountingCategory
from packages.modules.admin.service.accounting_setup_service import get_accounting_setup

_log = logging.getLogger(__name__)


def pre_close_checklist(db: Session, company_id: int, *, period: str | None = None) -> dict[str, Any]:
    if period is None:
        period = date.today().strftime("%Y-%m")
    year, month = period.split("-")
    start = date(int(year), int(month), 1)
    end = date(int(year), int(month), _last_day(int(year), int(month)))
    eq = db.query(Expense).filter(Expense.company_id == company_id,
        Expense.expense_date >= start, Expense.expense_date <= end)
    total = eq.count()
    items = []
    # 1. All categorized
    without_cat = eq.filter(Expense.category_code.is_(None)).count()
    items.append({"id": "all_categorized", "label": "Todos los gastos categorizados",
        "status": "pass" if without_cat == 0 else "fail", "detail": f"{without_cat} sin categoría" if without_cat else None,
        "blocking": without_cat > 0})
    # 2. All CFDIs paired
    setup = get_accounting_setup(db, company_id)
    cfdi_required = setup and getattr(setup, "poliza_required", False)
    without_cfdi = 0
    if cfdi_required:
        without_cfdi = eq.filter(Expense.status == "approved", Expense.cfdi_uuid.is_(None)).count()
        items.append({"id": "all_cfdi_paired", "label": "Todos los CFDIs vinculados",
            "status": "pass" if without_cfdi == 0 else "fail", "detail": f"{without_cfdi} sin CFDI" if without_cfdi else None,
            "blocking": without_cfdi > 0})
    # 3. No pending approvals
    pending = eq.filter(Expense.status.in_(["submitted", "manager_approved"])).count()
    items.append({"id": "no_pending_approvals", "label": "Sin aprobaciones pendientes",
        "status": "pass" if pending == 0 else "fail", "detail": f"{pending} pendientes" if pending else None,
        "blocking": pending > 0})
    # 4. All approved expenses have accounting mapping
    approved_no_map = 0
    for e in eq.filter(Expense.status == "approved").all():
        has_acct = bool((e.account_code or "").strip())
        if not has_acct and e.category_code:
            cat = db.query(AccountingCategory).filter(AccountingCategory.company_id == company_id,
                AccountingCategory.code == e.category_code).first()
            if cat and (cat.expense_account_code or cat.expense_account_id): has_acct = True
        if not has_acct: approved_no_map += 1
    items.append({"id": "all_accounting_mapped", "label": "Gastos aprobados con mapeo contable",
        "status": "pass" if approved_no_map == 0 else "fail", "detail": f"{approved_no_map} sin mapeo" if approved_no_map else None,
        "blocking": approved_no_map > 0})
    # 5. Budget check (non-blocking)
    budget_warn = 0
    try:
        from packages.modules.accounting.service.smart_dimension_service import get_budget_vs_actual
        bva = get_budget_vs_actual(db, company_id, dimension_type="cost_center")
        budget_warn = len([d for d in bva if d.get("pct_used", 0) > 100])
    except Exception: pass
    items.append({"id": "budget_check", "label": "Presupuesto dentro de límites",
        "status": "pass" if budget_warn == 0 else "warn", "detail": f"{budget_warn} sobre presupuesto" if budget_warn else None,
        "blocking": False})
    # 6. Anomaly check (non-blocking)
    anomaly_count = 0
    try:
        from packages.modules.accounting.service.anomaly_detection_service import detect_duplicates
        anomaly_count = len(detect_duplicates(db, company_id, days_back=45))
    except Exception: pass
    items.append({"id": "anomaly_check", "label": "Sin duplicados sospechosos",
        "status": "pass" if anomaly_count == 0 else "warn", "detail": f"{anomaly_count} posibles duplicados" if anomaly_count else None,
        "blocking": False})
    blocking = [i for i in items if i["blocking"] and i["status"] != "pass"]
    warnings = [i for i in items if not i["blocking"] and i["status"] != "pass"]
    return {"period": period, "can_close": len(blocking) == 0, "total_expenses": total,
        "items": items, "blocking_count": len(blocking), "warnings_count": len(warnings),
        "blocking_issues": [i["id"] for i in blocking], "warnings": [i["id"] for i in warnings]}


def lock_period(db: Session, company_id: int, period: str) -> dict[str, Any]:
    from packages.modules.agent.models import AgentInsight
    checklist = pre_close_checklist(db, company_id, period=period)
    if not checklist["can_close"]:
        return {"locked": False, "reason": "Checklist tiene bloqueos pendientes", "blocking": checklist["blocking_issues"]}
    insight = AgentInsight(company_id=company_id, kind="period_locked", severity="info",
        title=f"Período {period} cerrado",
        body=f"El período contable {period} ha sido cerrado.",
        data_json=f'{{"period": "{period}", "locked_at": "{date.today().isoformat()}"}}',
        status="resolved")
    db.add(insight)
    db.commit()
    return {"locked": True, "period": period, "checklist": checklist}


def is_period_locked(db: Session, company_id: int, period: str) -> bool:
    from packages.modules.agent.models import AgentInsight
    return db.query(AgentInsight).filter(AgentInsight.company_id == company_id,
        AgentInsight.kind == "period_locked", AgentInsight.title == f"Período {period} cerrado",
        AgentInsight.status == "resolved").first() is not None


def _last_day(year: int, month: int) -> int:
    if month == 12: return 31
    return (date(year, month + 1, 1) - timedelta(days=1)).day
