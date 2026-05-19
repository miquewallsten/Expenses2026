"""Change impact analysis — predicts effects of configuration changes."""
from __future__ import annotations
import logging
from typing import Any
from sqlalchemy.orm import Session
from packages.modules.expenses.models.expense import Expense

_log = logging.getLogger(__name__)


def analyze_impact(db: Session, company_id: int, *, setting: str, current_value: Any, new_value: Any) -> dict[str, Any]:
    impacts = []
    warnings = []
    if setting == "xml_required_mode":
        if new_value in ("required", "strict") and current_value != new_value:
            no_cfdi = db.query(Expense).filter(Expense.company_id == company_id,
                Expense.cfdi_uuid.is_(None), Expense.status.in_(["submitted", "manager_approved"])).count()
            impacts.append({"type": "expenses_blocked", "description": f"{no_cfdi} gastos sin CFDI no podrán avanzar",
                "count": no_cfdi, "severity": "warn"})
        elif new_value == "optional" and current_value != new_value:
            impacts.append({"type": "relaxed_validation", "description": "Gastos sin CFDI podrán ser aprobados", "severity": "info"})
    elif setting == "approval_mode":
        pending = db.query(Expense).filter(Expense.company_id == company_id,
            Expense.status.in_(["submitted", "manager_approved"])).count()
        if new_value == "none":
            impacts.append({"type": "skip_approvals",
                "description": f"{pending} gastos pendientes quedarían sin revisar",
                "count": pending, "severity": "critical"})
            warnings.append("Sin aprobación, cualquier gasto pasa directamente a contabilidad.")
        elif new_value == "accounting_only":
            mgr_pend = db.query(Expense).filter(Expense.company_id == company_id,
                Expense.status == "submitted").count()
            impacts.append({"type": "skip_manager",
                "description": f"{mgr_pend} gastos saltarán aprobación de manager",
                "count": mgr_pend, "severity": "warn"})
    elif setting == "accounting_review_mode":
        if new_value in ("none", "sampled"):
            review_count = db.query(Expense).filter(Expense.company_id == company_id,
                Expense.status == "manager_approved").count()
            impacts.append({"type": "reduced_accounting_review",
                "description": f"{review_count} gastos pendientes de revisión contable",
                "count": review_count, "severity": "warn" if new_value == "sampled" else "critical"})
    elif setting == "poliza_required":
        if new_value and not current_value:
            approved = db.query(Expense).filter(Expense.company_id == company_id,
                Expense.status == "approved").count()
            impacts.append({"type": "new_poliza_requirement",
                "description": f"{approved} gastos aprobados necesitarán póliza", "count": approved, "severity": "warn"})
    elif setting == "cost_center_required":
        if new_value and not current_value:
            no_cc = db.query(Expense).filter(Expense.company_id == company_id,
                Expense.cost_center_id.is_(None),
                Expense.status.in_(["submitted", "manager_approved", "approved"])).count()
            impacts.append({"type": "new_required_field",
                "description": f"{no_cc} gastos sin centro de costo no podrán avanzar", "count": no_cc, "severity": "warn"})
    elif setting == "project_required":
        if new_value and not current_value:
            no_pj = db.query(Expense).filter(Expense.company_id == company_id,
                Expense.project_id.is_(None),
                Expense.status.in_(["submitted", "manager_approved", "approved"])).count()
            impacts.append({"type": "new_required_field",
                "description": f"{no_pj} gastos sin proyecto no podrán avanzar", "count": no_pj, "severity": "warn"})
    elif setting == "category_mapping":
        impacts.append({"type": "category_remap",
            "description": "Gastos existentes conservan mapeo original. Solo nuevos usan nuevo mapeo.", "severity": "info"})
    
    sev_max = max([i["severity"] for i in impacts] + ["info"],
        key=lambda s: {"critical": 3, "warn": 2, "info": 1}.get(s, 0)) if impacts else "info"
    return {"setting": setting, "current_value": current_value, "new_value": new_value,
        "impacts": impacts, "warnings": warnings, "severity": sev_max}
