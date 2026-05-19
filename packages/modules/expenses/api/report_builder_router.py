"""Report Builder API — manual trigger, list, detail, resolve-issue endpoints.

These endpoints let accountants and admins:
  - Manually trigger report building for a company/user/period
  - List reports with status filters
  - Get detailed report with mappings and flagged issues
  - Resolve issues flagged by the builder (remap, exclude, acknowledge)
  - Get a póliza preview for a report
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_manager_or_accountant
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.service_permissions import has_permission
from packages.modules.expenses.models.report import ExpenseReport
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.service.report_builder_service import (
    build_reports_for_company,
    build_report_for_user,
    resolve_report_issue,
    get_report_detail,
)

router = APIRouter(
    prefix="/expenses/report-builder",
    tags=["report-builder"],
)


# ── Request / Response schemas ───────────────────────────────────────────────

class BuildReportsRequest(BaseModel):
    company_id: int
    user_id: int | None = Field(None, description="If set, build for one user only")
    period_start: date | None = Field(None, description="Start of period (defaults to current month)")
    period_end: date | None = Field(None, description="End of period (defaults to today)")
    triggered_by: str = Field(default="manual", description="manual | auto | user")


class ResolveIssueRequest(BaseModel):
    issue_index: int = Field(..., ge=0, description="Index of the issue in the notes array")
    resolution: str = Field(..., min_length=1, description="Accountant's resolution note")
    action: str = Field(default="acknowledge", description="acknowledge | remap | exclude_expense")
    new_account_code: str | None = Field(None, description="New account code if action=remap")
    exclude_expense_id: int | None = Field(None, description="Expense ID to exclude if action=exclude_expense")


class ReportSummaryResponse(BaseModel):
    id: int
    company_id: int
    title: str
    status: str
    user_id: int | None
    period_start: date | None
    period_end: date | None
    triggered_by: str
    total_amount: str | None
    expense_count: int | None
    currency: str
    settlement_type: str
    needs_accountant_review: bool
    generated_at: datetime | None
    created_at: datetime


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/build")
def build_reports(
    req: BuildReportsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually trigger report building for a company, user, or period."""
    if not has_permission(db, current_user, "reports:build"):
        raise HTTPException(status_code=403, detail="No permission to build reports")

    if req.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cross-company access denied")

    if req.user_id:
        # Build for a specific user
        result = build_report_for_user(
            db=db,
            company_id=req.company_id,
            user_id=req.user_id,
            period_start=req.period_start,
            period_end=req.period_end,
            triggered_by=req.triggered_by,
        )
        results = [result]
    else:
        # Build for all users in the company
        results = build_reports_for_company(
            db=db,
            company_id=req.company_id,
            period_start=req.period_start,
            period_end=req.period_end,
            triggered_by=req.triggered_by,
        )

    return {
        "ok": True,
        "reports_built": len(results),
        "results": [
            {
                "report_id": r.report_id,
                "user_id": r.user_id,
                "status": r.status,
                "period_label": r.period_label,
                "total_mxn": str(r.total_amount_mxn),
                "expense_count": len(r.expense_mappings),
                "critical_issues": sum(1 for i in r.issues if i.severity == "critical"),
                "warning_issues": sum(1 for i in r.issues if i.severity == "warning"),
                "notes": r.notes,
            }
            for r in results
        ],
    }


@router.get("/reports")
def list_reports(
    status: str | None = Query(None, description="Filter by status: draft, needs_review, submitted, approved"),
    needs_review: bool | None = Query(None, description="Filter reports needing accountant review"),
    user_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List expense reports with optional filters."""
    query = db.query(ExpenseReport).filter(ExpenseReport.company_id == current_user.company_id)

    if status:
        query = query.filter(ExpenseReport.status == status)
    if needs_review is not None:
        query = query.filter(ExpenseReport.needs_accountant_review == needs_review)
    if user_id:
        query = query.filter(ExpenseReport.user_id == user_id)

    query = query.order_by(ExpenseReport.created_at.desc())
    reports = query.limit(100).all()

    return [
        {
            "id": r.id,
            "company_id": r.company_id,
            "title": r.title,
            "status": r.status,
            "user_id": r.user_id,
            "period_start": r.period_start.isoformat() if r.period_start else None,
            "period_end": r.period_end.isoformat() if r.period_end else None,
            "triggered_by": r.triggered_by,
            "total_amount": str(r.total_amount) if r.total_amount else None,
            "expense_count": r.expense_count,
            "currency": r.currency,
            "settlement_type": r.settlement_type,
            "needs_accountant_review": r.needs_accountant_review,
            "generated_at": r.generated_at.isoformat() if r.generated_at else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in reports
    ]


@router.get("/reports/{report_id}")
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get detailed report with mappings and flagged issues."""
    detail = get_report_detail(db, report_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Report not found")

    report = db.query(ExpenseReport).filter(ExpenseReport.id == report_id).first()
    if report and report.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cross-company access denied")

    return detail


@router.post("/reports/{report_id}/resolve-issue")
def resolve_issue(
    report_id: int,
    req: ResolveIssueRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resolve a flagged issue on a report."""
    report = db.query(ExpenseReport).filter(ExpenseReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cross-company access denied")

    updated = resolve_report_issue(
        db=db,
        report_id=report_id,
        issue_index=req.issue_index,
        resolved_by=current_user.id,
        resolution=req.resolution,
        action=req.action,
        new_account_code=req.new_account_code,
        exclude_expense_id=req.exclude_expense_id,
    )

    if not updated:
        raise HTTPException(status_code=404, detail="Report not found after update")

    import json
    notes = json.loads(updated.notes or "[]")
    return {
        "ok": True,
        "report_id": updated.id,
        "status": updated.status,
        "needs_accountant_review": updated.needs_accountant_review,
        "resolved_issues": [n for n in notes if n.get("resolved")],
        "unresolved_issues": [n for n in notes if not n.get("resolved")],
    }


@router.get("/reports/{report_id}/poliza-preview")
def get_poliza_preview(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the aggregated póliza preview for all expenses in a report."""
    report = db.query(ExpenseReport).filter(ExpenseReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cross-company access denied")

    import json
    mapping_snapshot = json.loads(report.mapping_snapshot or "[]")

    # Aggregate póliza lines from all expense mappings
    all_lines = []
    total_debit = 0
    total_credit = 0
    for mapping in mapping_snapshot:
        lines = mapping.get("poliza_lines", [])
        for line in lines:
            all_lines.append({
                **line,
                "expense_id": mapping.get("expense_id"),
            })
            total_debit += float(line.get("debit", 0))
            total_credit += float(line.get("credit", 0))

    balanced = abs(total_debit - total_credit) < 0.01

    return {
        "report_id": report_id,
        "period": report.period_start.isoformat() if report.period_start else None,
        "lines": all_lines,
        "total_debit": f"{total_debit:.2f}",
        "total_credit": f"{total_credit:.2f}",
        "balanced": balanced,
        "expense_count": report.expense_count,
        "total_amount": str(report.total_amount) if report.total_amount else None,
    }


@router.get("/pending-reviews")
def list_pending_reviews(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List reports that need accountant review (flagged issues)."""
    reports = (
        db.query(ExpenseReport)
        .filter(
            ExpenseReport.company_id == current_user.company_id,
            ExpenseReport.needs_accountant_review == True,
        )
        .order_by(ExpenseReport.created_at.desc())
        .all()
    )

    import json
    result = []
    for r in reports:
        notes = json.loads(r.notes or "[]")
        critical = [n for n in notes if n.get("severity") == "critical" and not n.get("resolved")]
        warnings = [n for n in notes if n.get("severity") == "warning" and not n.get("resolved")]
        result.append({
            "id": r.id,
            "title": r.title,
            "status": r.status,
            "user_id": r.user_id,
            "period_start": r.period_start.isoformat() if r.period_start else None,
            "period_end": r.period_end.isoformat() if r.period_end else None,
            "total_amount": str(r.total_amount) if r.total_amount else None,
            "expense_count": r.expense_count,
            "critical_issues": len(critical),
            "warning_issues": len(warnings),
            "generated_at": r.generated_at.isoformat() if r.generated_at else None,
        })

    return result
