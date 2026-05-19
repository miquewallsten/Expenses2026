"""Report Builder Service — the smart engine that bundles expenses into reports,
pre-generates accounting mappings, flags issues, and routes through approval.

Core Design Principles
----------------------
* CONSERVATIVE: The builder builds, compiles, assigns, and flags. It NEVER
  approves, exports, or makes accounting decisions on its own.
* ACCOUNTABLE: Every issue is flagged as a note with severity, type, expense_id,
  and a human-readable message. The accountant always has the final say.
* NO CREATIVITY: If something is off (missing CFDI, unmapped category, over-budget),
  the builder flags it and moves on. It does not guess or invent data.
* PRE-MAPPING: For each expense, the builder pre-computes the accounting mapping
  (category→account, IVA split, dimension splits, currency conversion) and the
  póliza line preview. This saves the accountant manual work.
* BUNDLE BY USER PER PERIOD: Each user gets their own report per period. Never
  mixes users in the same report.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.report import ExpenseReport
from packages.core.platform.models_accounting_setup import AccountingSetup
from packages.core.platform.models_accounting_category import AccountingCategory
from packages.core.platform.models_tax_rate import TaxRate
from packages.core.platform.models_report_cycle import ReportCycleSettings
from packages.core.platform.models_cost_center import CostCenter
from packages.core.platform.models_project import Project
from packages.core.platform.models_client import Client
from packages.modules.expenses.models.expense_allocation import ExpenseAllocation
from packages.modules.admin.service.accounting_setup_service import get_accounting_setup
from packages.modules.accounting.service.poliza_simulator_service import simulate_poliza
from packages.modules.accounting.service.exchange_rate_cache_service import get_rate, convert_amount
from packages.core.platform.models_expense_policy import CompanyExpensePolicy

_log = logging.getLogger(__name__)


# ── Issue types that get flagged on the report ──────────────────────────────

class ReportIssue:
    """An issue found during report building that needs accountant attention."""
    def __init__(self, severity: str, issue_type: str, expense_id: int | None,
                 message: str, detail: dict | None = None):
        self.severity = severity  # "critical" | "warning" | "info"
        self.issue_type = issue_type  # e.g. "missing_cfdi", "unmapped_category", "over_budget"
        self.expense_id = expense_id
        self.message = message
        self.detail = detail or {}
        self.resolved = False
        self.resolved_by = None
        self.resolved_at = None

    def to_dict(self) -> dict:
        return {
            "severity": self.severity,
            "type": self.issue_type,
            "expense_id": self.expense_id,
            "message": self.message,
            "detail": self.detail,
            "resolved": self.resolved,
            "resolved_by": self.resolved_by,
            "resolved_at": self.resolved_at,
        }


# ── Per-expense mapping result ───────────────────────────────────────────────

class ExpenseMappingResult:
    """The full accounting mapping for a single expense."""
    def __init__(self, expense_id: int):
        self.expense_id = expense_id
        self.account_code: str | None = None
        self.account_name: str | None = None
        self.category_code: str | None = None
        self.base_amount: Decimal = Decimal("0")
        self.tax_amount: Decimal = Decimal("0")
        self.total_amount: Decimal = Decimal("0")
        self.tax_behavior: str | None = None  # acreditable, no_acreditable, exento, trasladable
        self.tax_rate: Decimal = Decimal("0")
        self.counter_account_code: str | None = None
        self.counter_account_name: str | None = None
        self.currency: str = "MXN"
        self.exchange_rate: Decimal | None = None
        self.amount_mxn: Decimal = Decimal("0")
        self.dimension_splits: list[dict] = []
        self.poliza_lines: list[dict] = []
        self.balanced: bool = False
        self.issues: list[ReportIssue] = []
        self.notes: list[str] = []

    def to_dict(self) -> dict:
        return {
            "expense_id": self.expense_id,
            "account_code": self.account_code,
            "account_name": self.account_name,
            "category_code": self.category_code,
            "base_amount": str(self.base_amount),
            "tax_amount": str(self.tax_amount),
            "total_amount": str(self.total_amount),
            "tax_behavior": self.tax_behavior,
            "tax_rate": str(self.tax_rate),
            "counter_account_code": self.counter_account_code,
            "currency": self.currency,
            "exchange_rate": str(self.exchange_rate) if self.exchange_rate else None,
            "amount_mxn": str(self.amount_mxn),
            "dimension_splits": self.dimension_splits,
            "poliza_lines": self.poliza_lines,
            "balanced": self.balanced,
            "issues": [i.to_dict() for i in self.issues],
            "notes": self.notes,
        }


class ReportBuildResult:
    """Result of building a report for a single user."""
    def __init__(self, report_id: int | None, user_id: int | None, period_label: str):
        self.report_id = report_id
        self.user_id = user_id
        self.period_label = period_label
        self.expense_mappings: list[ExpenseMappingResult] = []
        self.total_amount_mxn: Decimal = Decimal("0")
        self.status: str = "draft"  # draft, needs_review, error
        self.issues: list[ReportIssue] = []
        self.notes: list[str] = []


def _map_single_expense(
    db: Session,
    expense: Expense,
    setup: AccountingSetup | None,
) -> ExpenseMappingResult:
    """Map a single expense to its accounting entries.

    This is the core intelligence of the builder. It:
    1. Resolves the category → account mapping
    2. Splits IVA based on tax behavior
    3. Converts foreign currency to MXN using cached rates
    4. Applies dimension splits (project, client, cost center)
    5. Generates póliza line preview
    6. Flags any issues for accountant review

    It NEVER modifies data. It ONLY reads and computes.
    """
    result = ExpenseMappingResult(expense_id=expense.id)
    result.currency = expense.currency or "MXN"
    result.total_amount = expense.amount or Decimal("0")
    result.category_code = expense.category_code

    # ── Currency conversion ────────────────────────────────────────────────
    if expense.currency and expense.currency != "MXN":
        if expense.exchange_rate and expense.exchange_rate > 0:
            result.exchange_rate = expense.exchange_rate
        else:
            try:
                result.exchange_rate = Decimal(str(get_rate(db, expense.currency, "MXN") or 1))
            except Exception:
                result.exchange_rate = Decimal("1")
                result.issues.append(ReportIssue(
                    severity="warning",
                    issue_type="missing_exchange_rate",
                    expense_id=expense.id,
                    message=f"No se pudo obtener tasa de cambio para {expense.currency}. Se usa 1.0 como fallback.",
                    detail={"currency": expense.currency},
                ))

        if expense.amount_mxn and expense.amount_mxn > 0:
            result.amount_mxn = expense.amount_mxn
        elif result.exchange_rate:
            result.amount_mxn = (expense.amount * result.exchange_rate).quantize(Decimal("0.01"))
        else:
            result.amount_mxn = expense.amount
    else:
        result.amount_mxn = expense.amount
        result.exchange_rate = Decimal("1")

    # ── Category → Account mapping ────────────────────────────────────────
    if expense.account_code:
        result.account_code = expense.account_code
        result.notes.append(f"Cuenta explícita del gasto: {expense.account_code}")
    elif expense.category_code:
        cat = db.query(AccountingCategory).filter(
            AccountingCategory.company_id == expense.company_id,
            AccountingCategory.code == expense.category_code,
            AccountingCategory.is_active == True,
        ).first()
        if cat:
            result.account_code = cat.expense_account_code
            result.account_name = cat.expense_account_name if hasattr(cat, 'expense_account_name') else cat.name
            result.counter_account_code = cat.counterparty_account_code if hasattr(cat, 'counterparty_account_code') else None

            # Tax behavior from category
            if cat.tax_rate_id:
                tax_rate = db.query(TaxRate).filter(TaxRate.id == cat.tax_rate_id).first()
                if tax_rate:
                    result.tax_behavior = tax_rate.behavior
                    result.tax_rate = tax_rate.rate
                else:
                    result.issues.append(ReportIssue(
                        severity="warning",
                        issue_type="tax_rate_not_found",
                        expense_id=expense.id,
                        message=f"La categoría '{cat.code}' tiene una tasa de IVA que ya no existe.",
                        detail={"category_code": cat.code, "tax_rate_id": cat.tax_rate_id},
                    ))

            # Requires project/client/cost center?
            if getattr(cat, 'requires_project', False):
                result.notes.append(f"Categoría '{cat.code}' requiere proyecto.")
        else:
            result.issues.append(ReportIssue(
                severity="critical",
                issue_type="unmapped_category",
                expense_id=expense.id,
                message=f"Categoría '{expense.category_code}' no encontrada o inactiva. El contador debe asignar una cuenta.",
                detail={"category_code": expense.category_code},
            ))
    else:
        result.issues.append(ReportIssue(
            severity="critical",
            issue_type="no_category",
            expense_id=expense.id,
            message="Gasto sin categoría. El contador debe clasificarlo.",
        ))

    # ── IVA split ─────────────────────────────────────────────────────────
    if result.tax_behavior and result.tax_rate and result.tax_rate > 0:
        if result.tax_behavior in ("acreditable", "no_acreditable", "trasladable"):
            result.base_amount = (result.amount_mxn / (Decimal("1") + result.tax_rate)).quantize(Decimal("0.01"))
            result.tax_amount = (result.amount_mxn - result.base_amount).quantize(Decimal("0.01"))
        elif result.tax_behavior == "exento":
            result.base_amount = result.amount_mxn
            result.tax_amount = Decimal("0")
        else:
            result.base_amount = result.amount_mxn
            result.tax_amount = Decimal("0")
    else:
        result.base_amount = result.amount_mxn
        result.tax_amount = Decimal("0")

    # ── Dimension splits ──────────────────────────────────────────────────
    allocations = db.query(ExpenseAllocation).filter(
        ExpenseAllocation.expense_id == expense.id
    ).all()

    if allocations:
        for alloc in allocations:
            split = {
                "percent": alloc.percent,
                "amount_mxn": float(result.amount_mxn * Decimal(str(alloc.percent / 100)).quantize(Decimal("0.01"))),
            }
            if alloc.project_id:
                proj = db.query(Project).filter(Project.id == alloc.project_id).first()
                split["dimension_type"] = "project"
                split["dimension_id"] = alloc.project_id
                split["dimension_code"] = proj.code if proj and hasattr(proj, 'code') else str(alloc.project_id)
            elif alloc.client_id:
                client = db.query(Client).filter(Client.id == alloc.client_id).first()
                split["dimension_type"] = "client"
                split["dimension_id"] = alloc.client_id
                split["dimension_code"] = client.code if client and hasattr(client, 'code') else str(alloc.client_id)
            elif alloc.cost_center_id:
                cc = db.query(CostCenter).filter(CostCenter.id == alloc.cost_center_id).first()
                split["dimension_type"] = "cost_center"
                split["dimension_id"] = alloc.cost_center_id
                split["dimension_code"] = cc.code if cc and hasattr(cc, 'code') else str(alloc.cost_center_id)
            result.dimension_splits.append(split)
    else:
        # Single 100% allocation (no split)
        result.dimension_splits.append({
            "dimension_type": "none",
            "dimension_id": None,
            "dimension_code": None,
            "percent": 100,
            "amount_mxn": float(result.amount_mxn),
        })

    # ── CFDI check ────────────────────────────────────────────────────────
    cfdi_required = setup and getattr(setup, 'poliza_required', True)
    if cfdi_required and not expense.cfdi_uuid:
        if expense.currency == "MXN":
            result.issues.append(ReportIssue(
                severity="critical",
                issue_type="missing_cfdi",
                expense_id=expense.id,
                message="Gasto en MXN sin CFDI vinculado. Obligatorio para póliza SAT.",
                detail={"currency": expense.currency},
            ))
        else:
            result.issues.append(ReportIssue(
                severity="warning",
                issue_type="missing_cfdi",
                expense_id=expense.id,
                message="Gasto internacional sin CFDI. Se requiere documentación alternativa.",
                detail={"currency": expense.currency},
            ))

    # ── Póliza preview ────────────────────────────────────────────────────
    try:
        expense_dict = {
            "amount": float(result.amount_mxn),
            "category_code": expense.category_code or "",
            "description": expense.description,
            "date": expense.expense_date.isoformat() if expense.expense_date else None,
            "cost_center_code": result.dimension_splits[0].get("dimension_code") if result.dimension_splits else None,
            "project_code": None,
            "client_code": None,
        }
        # Find project/client from splits
        for s in result.dimension_splits:
            if s.get("dimension_type") == "project":
                expense_dict["project_code"] = s.get("dimension_code")
            elif s.get("dimension_type") == "client":
                expense_dict["client_code"] = s.get("dimension_code")

        poliza_result = simulate_poliza(db, expense.company_id, expense_dict)
        result.poliza_lines = poliza_result.get("lines", [])
        result.balanced = poliza_result.get("balanced", False)
        for warning in poliza_result.get("warnings", []):
            result.notes.append(f"Póliza: {warning}")
    except Exception as e:
        result.issues.append(ReportIssue(
            severity="warning",
            issue_type="poliza_generation_error",
            expense_id=expense.id,
            message=f"No se pudo generar vista previa de póliza: {str(e)}",
        ))

    # ── Check if account code is resolved ─────────────────────────────────
    if not result.account_code:
        result.issues.append(ReportIssue(
            severity="critical",
            issue_type="no_account_code",
            expense_id=expense.id,
            message="Sin cuenta contable asignada. El contador debe mapear la categoría o asignar manualmente.",
        ))

    return result


def build_report_for_user(
    db: Session,
    company_id: int,
    user_id: int,
    *,
    period_start: date | None = None,
    period_end: date | None = None,
    triggered_by: str = "auto",
    cycle_settings_id: int | None = None,
) -> ReportBuildResult:
    """Build a single expense report for one user's approved expenses.

    Steps:
    1. Find approved expenses for this user in the period
    2. Validate each one against policies
    3. Map each expense to accounting entries
    4. Create the ExpenseReport with pre-computed mappings
    5. Flag any issues for accountant review
    6. Return the result (never auto-approves)
    """
    if period_start is None:
        period_start = date.today().replace(day=1)
    if period_end is None:
        period_end = date.today()

    # Load company setup
    setup = get_accounting_setup(db, company_id)

    # Find approved, unbundled expenses for this user in the period
    expenses = (
        db.query(Expense)
        .filter(
            Expense.company_id == company_id,
            Expense.user_id == user_id,
            Expense.status == "approved",
            Expense.report_id.is_(None),
            Expense.is_deleted == False,
            Expense.expense_date >= period_start,
            Expense.expense_date <= period_end,
        )
        .order_by(Expense.expense_date)
        .all()
    )

    if not expenses:
        result = ReportBuildResult(None, user_id, f"{period_start.isoformat()}")
        result.notes.append(f"No hay gastos aprobados para el usuario {user_id} en el período.")
        result.status = "error"
        return result

    # Map each expense
    mappings: list[ExpenseMappingResult] = []
    all_issues: list[ReportIssue] = []
    total_mxn = Decimal("0")
    primary_settlement = expenses[0].settlement_type or "reimbursable"

    for expense in expenses:
        mapping = _map_single_expense(db, expense, setup)
        mappings.append(mapping)
        all_issues.extend(mapping.issues)
        total_mxn += mapping.amount_mxn

    # Create the report
    report = ExpenseReport(
        company_id=company_id,
        title=f"Reporte de gastos — {period_start.strftime('%b %Y')}",
        status="needs_review" if any(i.severity == "critical" for i in all_issues) else "draft",
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
        triggered_by=triggered_by,
        cycle_settings_id=cycle_settings_id,
        total_amount=total_mxn.quantize(Decimal("0.01")),
        expense_count=len(expenses),
        currency="MXN",
        settlement_type=primary_settlement,
        notes=json.dumps([i.to_dict() for i in all_issues], default=str),
        generated_at=datetime.utcnow(),
        needs_accountant_review=any(i.severity in ("critical", "warning") for i in all_issues),
        mapping_snapshot=json.dumps([m.to_dict() for m in mappings], default=str),
    )
    db.add(report)
    db.flush()

    # Link expenses to the report
    for expense in expenses:
        expense.report_id = report.id

    db.commit()
    db.refresh(report)

    # Build result
    result = ReportBuildResult(report.id, user_id, f"{period_start.isoformat()} — {period_end.isoformat()}")
    result.expense_mappings = mappings
    result.total_amount_mxn = total_mxn
    result.issues = all_issues
    result.status = report.status

    critical_count = sum(1 for i in all_issues if i.severity == "critical")
    warning_count = sum(1 for i in all_issues if i.severity == "warning")

    if critical_count > 0:
        result.notes.append(f"⚠️ {critical_count} problema(s) crítico(s) requieren atención del contador.")
    if warning_count > 0:
        result.notes.append(f"⚡ {warning_count} advertencia(s) identificada(s).")

    _log.info(
        "Built report %s for user %s: %d expenses, %d critical, %d warnings, total=%s",
        report.id, user_id, len(expenses), critical_count, warning_count, total_mxn,
    )

    return result


def build_reports_for_company(
    db: Session,
    company_id: int,
    *,
    period_start: date | None = None,
    period_end: date | None = None,
    triggered_by: str = "auto",
) -> list[ReportBuildResult]:
    """Build reports for all users with approved expenses in the company.

    This is the main entry point called by the scheduler or on-demand.
    """
    if period_start is None:
        period_start = date.today().replace(day=1)
    if period_end is None:
        period_end = date.today()

    # Get cycle settings
    settings = db.query(ReportCycleSettings).filter(
        ReportCycleSettings.company_id == company_id
    ).first()

    # Find all users with approved, unbundled expenses in the period
    user_ids = (
        db.query(Expense.user_id)
        .filter(
            Expense.company_id == company_id,
            Expense.status == "approved",
            Expense.report_id.is_(None),
            Expense.is_deleted == False,
            Expense.expense_date >= period_start,
            Expense.expense_date <= period_end,
            Expense.user_id.isnot(None),
        )
        .distinct()
        .all()
    )

    results = []
    for (user_id,) in user_ids:
        try:
            result = build_report_for_user(
                db=db,
                company_id=company_id,
                user_id=user_id,
                period_start=period_start,
                period_end=period_end,
                triggered_by=triggered_by,
                cycle_settings_id=settings.id if settings else None,
            )
            results.append(result)
        except Exception as e:
            _log.error("Failed to build report for user %s: %s", user_id, e)
            result = ReportBuildResult(None, user_id, f"{period_start.isoformat()}")
            result.notes.append(f"Error al construir reporte: {str(e)}")
            result.status = "error"
            results.append(result)

    return results


def resolve_report_issue(
    db: Session,
    report_id: int,
    issue_index: int,
    *,
    resolved_by: int,
    resolution: str,
    action: str = "acknowledge",
    new_account_code: str | None = None,
    exclude_expense_id: int | None = None,
) -> ExpenseReport | None:
    """Resolve a flagged issue on a report.

    Actions:
    - acknowledge: Mark as resolved, no data change
    - remap: Change the account code for the expense
    - exclude_expense: Remove the expense from this report
    """
    report = db.query(ExpenseReport).filter(ExpenseReport.id == report_id).first()
    if not report:
        return None

    notes = json.loads(report.notes or "[]")
    if issue_index < 0 or issue_index >= len(notes):
        raise ValueError(f"Invalid issue index {issue_index}. Report has {len(notes)} issues.")

    issue = notes[issue_index]
    issue["resolved"] = True
    issue["resolved_by"] = resolved_by
    issue["resolved_at"] = datetime.utcnow().isoformat()
    issue["resolution"] = resolution

    if action == "remap" and new_account_code and issue.get("expense_id"):
        expense = db.query(Expense).filter(Expense.id == issue["expense_id"]).first()
        if expense:
            expense.account_code = new_account_code
            # Update the mapping snapshot too
            mappings = json.loads(report.mapping_snapshot or "[]")
            for m in mappings:
                if m.get("expense_id") == expense.id:
                    m["account_code"] = new_account_code
                    m["notes"] = m.get("notes", []) + [f"Remapeado por contador: {new_account_code}"]
            report.mapping_snapshot = json.dumps(mappings, default=str)

    elif action == "exclude_expense" and exclude_expense_id:
        expense = db.query(Expense).filter(Expense.id == exclude_expense_id).first()
        if expense and expense.report_id == report_id:
            expense.report_id = None
            # Remove from mapping snapshot
            mappings = json.loads(report.mapping_snapshot or "[]")
            mappings = [m for m in mappings if m.get("expense_id") != exclude_expense_id]
            report.mapping_snapshot = json.dumps(mappings, default=str)
            # Update totals
            report.expense_count = (report.expense_count or 0) - 1

    report.notes = json.dumps(notes, default=str)

    # Check if all issues are now resolved
    all_resolved = all(n.get("resolved") for n in notes if n.get("severity") in ("critical", "warning"))
    if all_resolved:
        report.needs_accountant_review = False
        if report.status == "needs_review":
            report.status = "draft"

    db.commit()
    db.refresh(report)
    return report


def get_report_detail(db: Session, report_id: int) -> dict | None:
    """Get full report detail with parsed notes and mapping snapshot."""
    report = db.query(ExpenseReport).filter(ExpenseReport.id == report_id).first()
    if not report:
        return None

    parsed_notes = json.loads(report.notes or "[]")
    parsed_mapping = json.loads(report.mapping_snapshot or "[]")

    expenses = (
        db.query(Expense)
        .filter(Expense.report_id == report_id)
        .all()
    )

    return {
        "report": {
            "id": report.id,
            "company_id": report.company_id,
            "title": report.title,
            "status": report.status,
            "user_id": report.user_id,
            "period_start": report.period_start.isoformat() if report.period_start else None,
            "period_end": report.period_end.isoformat() if report.period_end else None,
            "triggered_by": report.triggered_by,
            "total_amount": str(report.total_amount) if report.total_amount else None,
            "expense_count": report.expense_count,
            "currency": report.currency,
            "settlement_type": report.settlement_type,
            "generated_at": report.generated_at.isoformat() if report.generated_at else None,
            "needs_accountant_review": report.needs_accountant_review,
            "created_at": report.created_at.isoformat() if report.created_at else None,
        },
        "issues": parsed_notes,
        "mappings": parsed_mapping,
        "expenses": [
            {
                "id": e.id,
                "description": e.description,
                "amount": float(e.amount),
                "currency": e.currency,
                "amount_mxn": float(e.amount_mxn) if e.amount_mxn else None,
                "category_code": e.category_code,
                "account_code": e.account_code,
                "status": e.status,
                "expense_date": e.expense_date.isoformat() if e.expense_date else None,
                "cfdi_uuid": e.cfdi_uuid,
                "settlement_type": e.settlement_type,
            }
            for e in expenses
        ],
    }
