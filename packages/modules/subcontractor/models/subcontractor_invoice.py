"""Subcontractor invoice models — mirrors the expense workflow for external contractors.

A SubcontractorInvoiceReport is the equivalent of an ExpenseReport: a bundle
of invoices submitted by a subcontractor for a period. Each report contains
one or more SubcontractorInvoice items (the individual CFDI/invoices).

Workflow: draft → submitted → validated → manager_approved → accounting_approved → paid
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer,
    Numeric, String, Text, Index, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.db import Base


# ── Invoice statuses ──────────────────────────────────────────────────────────
INVOICE_REPORT_STATUSES = (
    "draft",
    "submitted",
    "validated",         # CFDI/SAT validation passed
    "manager_approved",  # Client manager approved
    "accounting_approved",  # Accounting review complete
    "paid",
    "rejected",
)

INVOICE_STATUSES = (
    "draft",
    "submitted",
    "validated",
    "approved",
    "paid",
    "rejected",
)


class SubcontractorInvoiceReport(Base):
    """A bundle of invoices from a subcontractor for a billing period.

    Equivalent to ExpenseReport but for subcontractor invoices.
    Created by the subcontractor, routed through validation and approval.
    """
    __tablename__ = "subcontractor_invoice_reports"
    __table_args__ = (
        CheckConstraint(
            f"status IN {INVOICE_REPORT_STATUSES}",
            name="ck_sub_report_status_valid",
        ),
        Index("idx_sub_report_company_status", "company_id", "status"),
        Index("idx_sub_report_subcontractor", "company_id", "subcontractor_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    # The subcontractor (Client with RFC) who submitted this report
    subcontractor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("clients.id"), nullable=True, index=True,
    )

    # Internal user who manages this subcontractor relationship (optional)
    responsible_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True,
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="draft")

    # Billing period
    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Totals (computed from invoices)
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), server_default="0",
    )
    total_isr_retention: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), server_default="0",
    )
    total_iva_retention: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), server_default="0",
    )
    total_net: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), server_default="0",
    )

    # Dimension assignments (project, client, cost center)
    project_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    client_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_center_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Validation results
    validation_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True,
        comment="pending | passed | failed | warnings",
    )
    validation_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Approval
    approved_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Payment
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    payment_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    invoices: Mapped[list["SubcontractorInvoice"]] = relationship(
        back_populates="report", cascade="all, delete-orphan",
    )


class SubcontractorInvoice(Base):
    """A single invoice from a subcontractor — typically a CFDI with SAT validation.

    Equivalent to Expense but for invoices. Each invoice has one CFDI XML
    and optional PDF evidence.
    """
    __tablename__ = "subcontractor_invoices"
    __table_args__ = (
        CheckConstraint(
            f"status IN {INVOICE_STATUSES}",
            name="ck_sub_invoice_status_valid",
        ),
        CheckConstraint(
            "amount >= 0",
            name="ck_sub_invoice_amount_non_negative",
        ),
        Index("idx_sub_invoice_report", "report_id"),
        Index("idx_sub_invoice_company", "company_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    report_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("subcontractor_invoice_reports.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Invoice identification
    uuid: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True,
        comment="CFDI UUID from SAT")
    series: Mapped[str | None] = mapped_column(String(25), nullable=True)
    folio: Mapped[str | None] = mapped_column(String(40), nullable=True)

    # Financial amounts
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    isr_retention: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), server_default="0",
    )
    iva_retention: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), server_default="0",
    )
    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), server_default="0",
    )
    iva_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0"), server_default="0",
    )

    # Invoice metadata
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    invoice_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # CFDI / SAT validation
    sat_status: Mapped[str | None] = mapped_column(String(20), nullable=True,
        comment="valid | invalid | not_checked | cancelled")
    sat_validated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cfdi_version: Mapped[str | None] = mapped_column(String(10), nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(30), nullable=True,
        comment="CFDI payment method (PUE, PPD)")
    payment_form: Mapped[str | None] = mapped_column(String(30), nullable=True,
        comment="CFDI payment form (01= cash, 03= transfer, etc.)")

    # Accounting
    account_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    category_code: Mapped[str | None] = mapped_column(String(50), nullable=True)

    status: Mapped[str] = mapped_column(String(50), default="draft")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationship
    report: Mapped["SubcontractorInvoiceReport"] = relationship(back_populates="invoices")
