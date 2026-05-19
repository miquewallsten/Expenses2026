from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class Poliza(Base):
    """Póliza contable — the formal accounting journal entry.

    Generated from an approved ExpenseReport by the Report Builder.
    Contains structured line items (JSON) ready for export to COI, CONTPAQi,
    or other Mexican accounting systems.
    """
    __tablename__ = "polizas"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(Integer, index=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True)

    # Status: draft | needs_review | approved | rejected | exported
    status: Mapped[str] = mapped_column(
        String(50), default="draft",
        comment="draft | needs_review | approved | rejected | exported",
    )

    # Accounting period this póliza belongs to (e.g. "2026-05")
    period: Mapped[str | None] = mapped_column(
        String(7), nullable=True,
        comment="Accounting period in YYYY-MM format.",
    )

    # Output format configured by the accountant: "coi" | "contpaqi" | "csv" | "xml_sat"
    format: Mapped[str] = mapped_column(
        String(20), default="coi", server_default="coi", nullable=False,
    )

    # Structured line items stored as JSON text.
    # Each line: {"account_code": str, "account_name": str,
    #             "debit": str, "credit": str, "note": str,
    #             "dimension_splits": [...], "tax_behavior": str|null}
    line_items: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Pre-computed totals for quick validation
    total_debit: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    total_credit: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    balanced: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False,
        comment="True if total_debit == total_credit.",
    )

    # Human-readable notes from the builder (issues, warnings, resolution notes)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Legacy text field kept for backward compatibility
    content_text: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
