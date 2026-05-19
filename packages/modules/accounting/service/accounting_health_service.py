"""Accounting health service — comprehensive health check and proactive insights."""
from __future__ import annotations
import logging
from typing import Any
from sqlalchemy import func
from sqlalchemy.orm import Session
from packages.core.platform.models_accounting_setup import AccountingSetup
from packages.core.platform.models_accounting_category import AccountingCategory
from packages.core.platform.models_accounting_account import AccountingAccount
from packages.core.platform.models_tax_rate import TaxRate
from packages.core.platform.models_cost_center import CostCenter
from packages.core.platform.models_project import Project
from packages.core.platform.models_client import Client
from packages.modules.expenses.models.expense import Expense
from packages.modules.admin.service.accounting_setup_service import get_accounting_setup

_log = logging.getLogger(__name__)


def full_health_check(db: Session, company_id: int) -> dict[str, Any]:
    setup = get_accounting_setup(db, company_id)
    checks = []
    score = 100
    # 1. Setup exists
    has_setup = setup is not None
    checks.append({"id": "has_accounting_setup", "label": "Configuración contable inicializada",
        "status": "pass" if has_setup else "fail", "weight": 20})
    if not has_setup: score -= 20
    # 2. Chart of accounts
    acct_count = db.query(AccountingAccount).filter(AccountingAccount.company_id == company_id,
        AccountingAccount.is_active == True).count()
    checks.append({"id": "has_chart_of_accounts", "label": "Catálogo de cuentas",
        "status": "pass" if acct_count > 0 else "fail", "detail": f"{acct_count} cuentas", "weight": 15})
    if acct_count == 0: score -= 15
    # 3. Tax rates
    tax_count = db.query(TaxRate).filter(TaxRate.company_id == company_id).count()
    checks.append({"id": "has_tax_rates", "label": "Tasas de IVA/ISR",
        "status": "pass" if tax_count > 0 else "fail", "detail": f"{tax_count} tasas", "weight": 10})
    if tax_count == 0: score -= 10
    # 4. Categories mapped
    total_cats = db.query(AccountingCategory).filter(AccountingCategory.company_id == company_id,
        AccountingCategory.is_active == True).count()
    mapped = db.query(AccountingCategory).filter(AccountingCategory.company_id == company_id,
        AccountingCategory.is_active == True, AccountingCategory.expense_account_code.isnot(None)).count()
    unmapped = total_cats - mapped
    checks.append({"id": "categories_mapped", "label": "Categorías mapeadas",
        "status": "pass" if unmapped == 0 and total_cats > 0 else ("warn" if total_cats > 0 else "fail"),
        "detail": f"{mapped}/{total_cats} mapeadas", "weight": 15})
    if total_cats == 0: score -= 15
    elif unmapped > 0: score -= min(10, unmapped * 2)
    # 5. Dimensions
    cc_c = db.query(CostCenter).filter(CostCenter.company_id == company_id, CostCenter.status == "active").count()
    pj_c = db.query(Project).filter(Project.company_id == company_id, Project.status == "active").count()
    cl_c = db.query(Client).filter(Client.company_id == company_id, Client.status == "active").count()
    has_dims = cc_c > 0 or pj_c > 0
    checks.append({"id": "has_dimensions", "label": "Dimensiones configuradas",
        "status": "pass" if has_dims else "warn", "detail": f"{cc_c} CC, {pj_c} proyectos, {cl_c} clientes", "weight": 10})
    if not has_dims: score -= 5
    # 6. Unmapped expenses
    unmapped_exp = db.query(Expense).filter(Expense.company_id == company_id,
        Expense.status.in_(["submitted", "manager_approved", "approved"]),
        Expense.category_code.is_(None)).count()
    checks.append({"id": "no_unmapped_expenses", "label": "Gastos categorizados",
        "status": "pass" if unmapped_exp == 0 else "fail", "detail": f"{unmapped_exp} sin categoría", "weight": 10})
    if unmapped_exp > 0: score -= min(10, unmapped_exp)
    # 7. Missing CFDIs
    missing_cfdi = db.query(Expense).filter(Expense.company_id == company_id,
        Expense.status == "approved", Expense.cfdi_uuid.is_(None)).count()
    checks.append({"id": "no_missing_cfdi", "label": "CFDIs vinculados",
        "status": "pass" if missing_cfdi == 0 else "warn", "detail": f"{missing_cfdi} sin CFDI", "weight": 10})
    if missing_cfdi > 0: score -= min(5, missing_cfdi)
    # 8. Póliza format
    poliza_cfg = setup and setup.poliza_required
    checks.append({"id": "poliza_configured", "label": "Formato de póliza",
        "status": "pass" if poliza_cfg else "warn", "weight": 5})
    if not poliza_cfg: score -= 3
    # 9. Custom rules
    try:
        from packages.modules.accounting.service.custom_rule_service import list_rules
        rules = list_rules(db, company_id)
        checks.append({"id": "custom_rules", "label": "Reglas personalizadas",
            "status": "pass" if len(rules) > 0 else "info", "detail": f"{len(rules)} reglas", "weight": 5})
    except Exception:
        checks.append({"id": "custom_rules", "label": "Reglas personalizadas", "status": "info", "weight": 5})
    
    score = max(0, min(100, score))
    recs = _generate_recommendations(checks, setup)
    overall = "excellent" if score >= 90 else ("good" if score >= 70 else ("needs_work" if score >= 50 else "critical"))
    return {"health_score": score, "checks": checks, "recommendations": recs, "overall": overall}


def _generate_recommendations(checks: list[dict], setup: AccountingSetup | None) -> list[str]:
    recs = []
    _map = {
        "has_accounting_setup": "Inicia la configuración contable con el asistente guiado.",
        "has_chart_of_accounts": "Configura tu catálogo de cuentas o aplica el Plan Básico SAT.",
        "has_tax_rates": "Agrega tasas de IVA/ISR (16% acreditable, 8%, exento, etc.).",
        "categories_mapped": "Mapea las categorías sin cuenta contable usando map_category_to_accounts.",
        "no_unmapped_expenses": "Ejecuta auto_categorize_expenses para categorizar gastos pendientes.",
        "no_missing_cfdi": "Vincula CFDIs faltantes con cfdi_pair o cfdi_mass_check.",
        "poliza_configured": "Configura el formato de póliza (COI, CONTPAQi, SAT).",
    }
    for c in checks:
        if c["status"] == "fail" and c["id"] in _map:
            recs.append(_map[c["id"]])
    return recs
