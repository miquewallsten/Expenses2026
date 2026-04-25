"""SQLAlchemy models for the Amex Reconciliation module."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


STATEMENT_STATUSES = ("draft", "submitted", "manager_approved", "approved", "rejected")
LINE_STATUSES = ("unmatched", "matched", "no_invoice", "missing")
MATCH_CONFIDENCES = ("none", "auto", "manual", "high")


class AmexStatement(Base):
    """One monthly Amex statement upload — aggregates many line items."""

    __tablename__ = "amex_statements"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft','submitted','manager_approved','approved','rejected')",
            name="ck_amex_statement_status_valid",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    reconciler_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    card_last4: Mapped[str | None] = mapped_column(String(8), nullable=True)
    currency: Mapped[str] = mapped_column(String(10), default="MXN", nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0, nullable=False)
    line_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="draft", nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expense_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    report_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class AmexStatementLine(Base):
    """A single charge parsed from the Amex CSV."""

    __tablename__ = "amex_statement_lines"
    __table_args__ = (
        CheckConstraint(
            "status IN ('unmatched','matched','no_invoice','missing')",
            name="ck_amex_line_status_valid",
        ),
        Index("ix_amex_line_statement", "statement_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    statement_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("amex_statements.id", ondelete="CASCADE"), nullable=False
    )
    company_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)
    posted_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    merchant: Mapped[str | None] = mapped_column(String(255), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="MXN", nullable=False)
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Assignment
    project_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_center_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    category_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Matching
    matched_document_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("amex_cfdi_documents.id", ondelete="SET NULL"), nullable=True, index=True
    )
    match_confidence: Mapped[str] = mapped_column(String(20), default="none", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="unmatched", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class AmexCfdiDocument(Base):
    """A CFDI pair (XML + optional PDF) uploaded against a statement.

    One row per CFDI identity. XML is required; PDF is optional but will be
    auto-paired if its embedded QR UUID matches.
    """

    __tablename__ = "amex_cfdi_documents"
    __table_args__ = (
        Index("ix_amex_doc_statement", "statement_id"),
        Index("ix_amex_doc_uuid", "uuid"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    statement_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("amex_statements.id", ondelete="CASCADE"), nullable=False
    )
    company_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    # XML (required)
    xml_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    xml_storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    xml_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    # PDF (optional)
    pdf_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pdf_storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # CFDI identity
    uuid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    emisor_rfc: Mapped[str | None] = mapped_column(String(20), nullable=True)
    emisor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    receptor_rfc: Mapped[str | None] = mapped_column(String(20), nullable=True)
    total: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    subtotal: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    invoice_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Validation summary
    sat_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    validation_status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    validation_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
