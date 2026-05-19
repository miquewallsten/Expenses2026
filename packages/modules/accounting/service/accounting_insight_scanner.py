"""Accounting insight scanner — proactive findings that surface in the copilot."""
from __future__ import annotations
import logging
from datetime import date, timedelta
from typing import Any
from sqlalchemy import func
from sqlalchemy.orm import Session
from packages.modules.expenses.models.expense import Expense
from packages.core.platform.models_accounting_category import AccountingCategory
from packages.modules.agent.models import AgentInsight

_log = logging.getLogger(__name__)


def scan_all(db: Session, company_id: int) -> list[AgentInsight]:
    new = []
    new.extend(_scan_unmapped_categories(db, company_id))
    new.extend(_scan_missing_cfdi(db, company_id))
    new.extend(_scan_budget_overruns(db, company_id))
    new.extend(_scan_stale_approvals(db, company_id))
    new.extend(_scan_upcoming_deadlines(db, company_id))
    return new


def _scan_unmapped_categories(db: Session, company_id: int) -> list[AgentInsight]:
    unmapped = db.query(AccountingCategory).filter(AccountingCategory.company_id == company_id,
        AccountingCategory.is_active == True, AccountingCategory.expense_account_code.is_(None)).all()
    if not unmapped: return []
    existing = db.query(AgentInsight).filter(AgentInsight.company_id == company_id,
        AgentInsight.kind == "unmapped_categories", AgentInsight.status == "open").first()
    if existing:
        existing.body = f"{len(unmapped)} categorías sin mapeo: {', '.join(c.code for c in unmapped[:5])}"
        db.commit()
        return []
    insight = AgentInsight(company_id=company_id, kind="unmapped_categories", severity="warn",
        title="Categorías sin mapeo contable",
        body=f"{len(unmapped)} categorías sin cuenta contable: {', '.join(c.code for c in unmapped[:5])}",
        suggested_prompt="Mapea las categorías sin cuenta contable")
    db.add(insight)
    db.commit()
    return [insight]


def _scan_missing_cfdi(db: Session, company_id: int) -> list[AgentInsight]:
    missing = db.query(Expense).filter(Expense.company_id == company_id,
        Expense.status == "approved", Expense.cfdi_uuid.is_(None)).count()
    if missing == 0: return []
    existing = db.query(AgentInsight).filter(AgentInsight.company_id == company_id,
        AgentInsight.kind == "missing_cfdi", AgentInsight.status == "open").first()
    if existing:
        existing.body = f"{missing} gastos aprobados sin CFDI"
        db.commit()
        return []
    insight = AgentInsight(company_id=company_id, kind="missing_cfdi", severity="warn",
        title="CFDIs faltantes",
        body=f"{missing} gastos aprobados sin CFDI vinculado. Ejecuta cfdi_mass_check para ver detalles.",
        suggested_prompt="Vincula los CFDIs faltantes")
    db.add(insight)
    db.commit()
    return [insight]


def _scan_budget_overruns(db: Session, company_id: int) -> list[AgentInsight]:
    from packages.core.platform.models_cost_center import CostCenter
    ccs = db.query(CostCenter).filter(CostCenter.company_id == company_id,
        CostCenter.status == "active", CostCenter.budget_amount.isnot(None), CostCenter.budget_amount > 0).all()
    over = []
    for cc in ccs:
        spent = db.query(func.sum(Expense.amount)).filter(Expense.company_id == company_id,
            Expense.cost_center_id == cc.id, Expense.status.in_(["approved", "paid"])).scalar() or 0
        if float(spent) > float(cc.budget_amount or 0):
            over.append({"name": cc.name, "budget": float(cc.budget_amount), "spent": float(spent)})
    if not over: return []
    insight = AgentInsight(company_id=company_id, kind="over_budget", severity="critical",
        title="Centros de costo sobre presupuesto",
        body=f"{len(over)} centros excedidos: {', '.join(o['name'] for o in over[:3])}",
        suggested_prompt="Revisa los centros de costo sobre presupuesto")
    db.add(insight)
    db.commit()
    return [insight]


def _scan_stale_approvals(db: Session, company_id: int) -> list[AgentInsight]:
    cutoff = date.today() - timedelta(days=5)
    stale = db.query(Expense).filter(Expense.company_id == company_id,
        Expense.status.in_(["submitted", "manager_approved"]), Expense.expense_date < cutoff).count()
    if stale == 0: return []
    insight = AgentInsight(company_id=company_id, kind="stale_approvals", severity="warn",
        title="Aprobaciones estancadas",
        body=f"{stale} gastos llevan más de 5 días pendientes de aprobación",
        suggested_prompt="Revisa las aprobaciones pendientes")
    db.add(insight)
    db.commit()
    return [insight]


def _scan_upcoming_deadlines(db: Session, company_id: int) -> list[AgentInsight]:
    from packages.modules.accounting.service.fiscal_calendar_service import get_upcoming_deadlines
    deadlines = get_upcoming_deadlines(db, company_id, months_ahead=1)
    critical = [d for d in deadlines if d.get("urgency") == "critical"]
    if not critical: return []
    insight = AgentInsight(company_id=company_id, kind="sat_deadline", severity="critical",
        title="Fecha límite SAT próxima",
        body=f"{len(critical)} fechas críticas: {', '.join(d['name'] for d in critical[:3])}",
        suggested_prompt="Prepara la declaración próxima")
    db.add(insight)
    db.commit()
    return [insight]
