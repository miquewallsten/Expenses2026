"""Subcontractor portal API — invoice report CRUD, validation, approval workflow."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.module_gate import require_module
from packages.modules.subcontractor.models.subcontractor_invoice import (
    SubcontractorInvoice,
    SubcontractorInvoiceReport,
)

router = APIRouter(
    prefix="/subcontractor",
    tags=["subcontractor"],
    dependencies=[Depends(require_module("subcontractor"))],
)


# ── Schemas ──────────────────────────────────────────────────────────────────────

class InvoiceCreate(BaseModel):
    amount: Decimal
    description: str | None = None
    invoice_date: date | None = None
    series: str | None = None
    folio: str | None = None
    isr_retention: Decimal = Decimal("0")
    iva_retention: Decimal = Decimal("0")
    subtotal: Decimal = Decimal("0")
    iva_amount: Decimal = Decimal("0")
    payment_method: str | None = None
    payment_form: str | None = None
    account_code: str | None = None
    category_code: str | None = None


class ReportCreate(BaseModel):
    title: str
    subcontractor_id: int | None = None
    project_id: int | None = None
    client_id: int | None = None
    cost_center_id: int | None = None
    period_start: date | None = None
    period_end: date | None = None
    notes: str | None = None


class InvoiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    report_id: int
    amount: Decimal
    isr_retention: Decimal
    iva_retention: Decimal
    subtotal: Decimal
    iva_amount: Decimal
    description: str | None
    invoice_date: date | None
    series: str | None
    folio: str | None
    uuid: str | None
    sat_status: str | None
    status: str
    created_at: datetime


class ReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    status: str
    subcontractor_id: int | None
    total_amount: Decimal
    total_isr_retention: Decimal
    total_iva_retention: Decimal
    total_net: Decimal
    validation_status: str | None
    period_start: date | None
    period_end: date | None
    invoice_count: int = 0
    created_at: datetime
    updated_at: datetime


class ReportDetail(ReportRead):
    invoices: list[InvoiceRead] = []
    notes: str | None = None


# ── Routes ───────────────────────────────────────────────────────────────────────

@router.get("/{company_id}/reports", response_model=list[ReportRead])
def list_reports(
    company_id: int,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List invoice reports for a company. Subcontractors see only their own."""
    require_same_company(company_id, current_user)
    query = db.query(SubcontractorInvoiceReport).filter(
        SubcontractorInvoiceReport.company_id == company_id
    )
    # Subcontractor users only see their own reports
    if current_user.is_subcontractor:
        # Find the Client record matching this user
        from packages.core.platform.models_client import Client
        sub = db.query(Client).filter(
            Client.company_id == company_id,
            Client.contact_email == current_user.email,
        ).first()
        if sub:
            query = query.filter(SubcontractorInvoiceReport.subcontractor_id == sub.id)
    if status:
        query = query.filter(SubcontractorInvoiceReport.status == status)
    reports = query.order_by(SubcontractorInvoiceReport.created_at.desc()).all()
    result = []
    for r in reports:
        invoice_count = db.query(SubcontractorInvoice).filter(
            SubcontractorInvoice.report_id == r.id
        ).count()
        rd = ReportRead.model_validate(r)
        rd.invoice_count = invoice_count  # type: ignore
        result.append(rd)
    return result


@router.get("/{company_id}/reports/{report_id}", response_model=ReportDetail)
def get_report(
    company_id: int,
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(company_id, current_user)
    report = db.query(SubcontractorInvoiceReport).filter(
        SubcontractorInvoiceReport.id == report_id,
        SubcontractorInvoiceReport.company_id == company_id,
    ).first()
    if not report:
        raise HTTPException(404, "Report not found")
    invoices = db.query(SubcontractorInvoice).filter(
        SubcontractorInvoice.report_id == report_id
    ).all()
    detail = ReportDetail.model_validate(report)
    detail.invoices = [InvoiceRead.model_validate(i) for i in invoices]  # type: ignore
    return detail


@router.post("/{company_id}/reports", response_model=ReportDetail, status_code=201)
def create_report(
    company_id: int,
    body: ReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(company_id, current_user)
    report = SubcontractorInvoiceReport(
        company_id=company_id,
        title=body.title,
        subcontractor_id=body.subcontractor_id,
        responsible_user_id=current_user.id,
        project_id=body.project_id,
        client_id=body.client_id,
        cost_center_id=body.cost_center_id,
        period_start=body.period_start,
        period_end=body.period_end,
        notes=body.notes,
        status="draft",
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    detail = ReportDetail.model_validate(report)
    detail.invoices = []
    return detail


@router.post("/{company_id}/reports/{report_id}/invoices", response_model=InvoiceRead, status_code=201)
def add_invoice(
    company_id: int,
    report_id: int,
    body: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(company_id, current_user)
    report = db.query(SubcontractorInvoiceReport).filter(
        SubcontractorInvoiceReport.id == report_id,
        SubcontractorInvoiceReport.company_id == company_id,
    ).first()
    if not report:
        raise HTTPException(404, "Report not found")
    if report.status not in ("draft", "submitted"):
        raise HTTPException(400, "Cannot add invoices to a report that is past submission")
    invoice = SubcontractorInvoice(
        company_id=company_id,
        report_id=report_id,
        amount=body.amount,
        description=body.description,
        invoice_date=body.invoice_date,
        series=body.series,
        folio=body.folio,
        isr_retention=body.isr_retention,
        iva_retention=body.iva_retention,
        subtotal=body.subtotal,
        iva_amount=body.iva_amount,
        payment_method=body.payment_method,
        payment_form=body.payment_form,
        account_code=body.account_code,
        category_code=body.category_code,
        status="draft",
    )
    db.add(invoice)
    # Recalculate report totals
    db.flush()
    invs = db.query(SubcontractorInvoice).filter(SubcontractorInvoice.report_id == report_id).all()
    report.total_amount = sum(i.amount for i in invs)
    report.total_isr_retention = sum(i.isr_retention for i in invs)
    report.total_iva_retention = sum(i.iva_retention for i in invs)
    report.total_net = report.total_amount - report.total_isr_retention - report.total_iva_retention
    db.commit()
    db.refresh(invoice)
    return InvoiceRead.model_validate(invoice)


@router.patch("/{company_id}/reports/{report_id}/submit", response_model=ReportRead)
def submit_report(
    company_id: int,
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a draft report for validation and approval."""
    require_same_company(company_id, current_user)
    report = db.query(SubcontractorInvoiceReport).filter(
        SubcontractorInvoiceReport.id == report_id,
        SubcontractorInvoiceReport.company_id == company_id,
    ).first()
    if not report:
        raise HTTPException(404, "Report not found")
    if report.status != "draft":
        raise HTTPException(400, "Only draft reports can be submitted")
    inv_count = db.query(SubcontractorInvoice).filter(
        SubcontractorInvoice.report_id == report_id
    ).count()
    if inv_count == 0:
        raise HTTPException(400, "Report must have at least one invoice")
    report.status = "submitted"
    db.commit()
    db.refresh(report)
    return ReportRead.model_validate(report)


# ── Validation & Approval ──────────────────────────────────────────────────────

@router.patch("/{company_id}/reports/{report_id}/validate", response_model=ReportRead)
def validate_report(
    company_id: int,
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a submitted report as validated (CFDI/SAT check passed)."""
    require_same_company(company_id, current_user)
    report = db.query(SubcontractorInvoiceReport).filter(
        SubcontractorInvoiceReport.id == report_id,
        SubcontractorInvoiceReport.company_id == company_id,
    ).first()
    if not report:
        raise HTTPException(404, "Report not found")
    if report.status != "submitted":
        raise HTTPException(400, "Only submitted reports can be validated")
    report.status = "validated"
    report.validation_status = "passed"
    db.commit()
    db.refresh(report)
    return ReportRead.model_validate(report)


@router.patch("/{company_id}/reports/{report_id}/approve", response_model=ReportRead)
def approve_report(
    company_id: int,
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Approve a validated report (manager or accounting)."""
    require_same_company(company_id, current_user)
    report = db.query(SubcontractorInvoiceReport).filter(
        SubcontractorInvoiceReport.id == report_id,
        SubcontractorInvoiceReport.company_id == company_id,
    ).first()
    if not report:
        raise HTTPException(404, "Report not found")
    if report.status not in ("validated", "manager_approved"):
        raise HTTPException(400, "Report cannot be approved from current status")
    # First approval: manager; second: accounting
    if report.status == "validated":
        report.status = "manager_approved"
    elif report.status == "manager_approved":
        report.status = "accounting_approved"
    report.approved_by = current_user.id
    from datetime import datetime
    report.approved_at = datetime.utcnow()
    db.commit()
    db.refresh(report)
    return ReportRead.model_validate(report)


@router.patch("/{company_id}/reports/{report_id}/reject", response_model=ReportRead)
def reject_report(
    company_id: int,
    report_id: int,
    reason: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reject a report at any approval stage."""
    require_same_company(company_id, current_user)
    report = db.query(SubcontractorInvoiceReport).filter(
        SubcontractorInvoiceReport.id == report_id,
        SubcontractorInvoiceReport.company_id == company_id,
    ).first()
    if not report:
        raise HTTPException(404, "Report not found")
    if report.status not in ("submitted", "validated", "manager_approved"):
        raise HTTPException(400, "Report cannot be rejected from current status")
    report.status = "rejected"
    if reason:
        report.validation_notes = reason
    db.commit()
    db.refresh(report)
    return ReportRead.model_validate(report)


@router.patch("/{company_id}/reports/{report_id}/pay", response_model=ReportRead)
def mark_paid(
    company_id: int,
    report_id: int,
    payment_reference: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark an accounting-approved report as paid."""
    require_same_company(company_id, current_user)
    report = db.query(SubcontractorInvoiceReport).filter(
        SubcontractorInvoiceReport.id == report_id,
        SubcontractorInvoiceReport.company_id == company_id,
    ).first()
    if not report:
        raise HTTPException(404, "Report not found")
    if report.status != "accounting_approved":
        raise HTTPException(400, "Only accounting-approved reports can be marked as paid")
    report.status = "paid"
    from datetime import datetime
    report.paid_at = datetime.utcnow()
    if payment_reference:
        report.payment_reference = payment_reference
    db.commit()
    db.refresh(report)
    return ReportRead.model_validate(report)


@router.delete("/{company_id}/reports/{report_id}", status_code=204)
def delete_report(
    company_id: int,
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a draft report. Only draft reports can be deleted."""
    require_same_company(company_id, current_user)
    report = db.query(SubcontractorInvoiceReport).filter(
        SubcontractorInvoiceReport.id == report_id,
        SubcontractorInvoiceReport.company_id == company_id,
    ).first()
    if not report:
        raise HTTPException(404, "Report not found")
    if report.status != "draft":
        raise HTTPException(400, "Only draft reports can be deleted")
    db.delete(report)
    db.commit()


@router.delete("/{company_id}/reports/{report_id}/invoices/{invoice_id}", status_code=204)
def delete_invoice(
    company_id: int,
    report_id: int,
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an invoice from a draft report."""
    require_same_company(company_id, current_user)
    report = db.query(SubcontractorInvoiceReport).filter(
        SubcontractorInvoiceReport.id == report_id,
        SubcontractorInvoiceReport.company_id == company_id,
    ).first()
    if not report:
        raise HTTPException(404, "Report not found")
    if report.status != "draft":
        raise HTTPException(400, "Can only delete invoices from draft reports")
    invoice = db.query(SubcontractorInvoice).filter(
        SubcontractorInvoice.id == invoice_id,
        SubcontractorInvoice.report_id == report_id,
    ).first()
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    db.delete(invoice)
    # Recalculate totals
    db.flush()
    invs = db.query(SubcontractorInvoice).filter(SubcontractorInvoice.report_id == report_id).all()
    report.total_amount = sum(i.amount for i in invs)
    report.total_isr_retention = sum(i.isr_retention for i in invs)
    report.total_iva_retention = sum(i.iva_retention for i in invs)
    report.total_net = report.total_amount - report.total_isr_retention - report.total_iva_retention
    db.commit()
