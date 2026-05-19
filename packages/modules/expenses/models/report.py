from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class ExpenseReport(Base):
    """Expense report — a bundle of approved expenses per user per period.

    Created by the Report Builder Agent (auto), admin trigger (manual),
    or user action. Pre-mapped with accounting entries and poliza previews.
    Issues flagged by the builder appear in ``notes`` for accountant review.
    The accountant always has the final say — the builder NEVER approves
    or exports on its own.
    """
    __tablename__ = "expense_reports"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default="draft",
        comment="draft | needs_review | submitted | manager_approved | approved | rejected",
    )

    # Per-user report: which user's expenses are bundled here.
    # Null for manually composed multi-user reports.
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    # The calendar period this bundle covers.
    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)

    # How this report was created: "auto" (scheduled cycle), "manual" (admin trigger), "user"
    triggered_by: Mapped[str] = mapped_column(String(20), default="user", server_default="user")

    # FK back to the cycle settings row that generated this report (nullable for user-created)
    cycle_settings_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ── Aggregate fields (populated by Report Builder) ───────────────────────

    total_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 2), nullable=True,
        comment="Sum of all expense amounts in the report (MXN).",
    )
    expense_count: Mapped[int | None] = mapped_column(
        Integer, nullable=True,
        comment="Number of expenses bundled in this report.",
    )
    currency: Mapped[str] = mapped_column(
        String(3), default="MXN", server_default="MXN", nullable=False,
    )
    settlement_type: Mapped[str] = mapped_column(
        String(20), default="reimbursable", server_default="reimbursable", nullable=False,
        comment="Primary settlement type of the bundled expenses.",
    )

    # ── Issue tracking ───────────────────────────────────────────────────────
    # JSON array stored as Text. Each element is a dict:
    #   {"severity": "critical"|"warning"|"info",
    #    "type": "missing_cfdi"|"unmapped_category"|"over_budget"|...,
    #    "expense_id": int|null,
    #    "message": str,
    #    "detail": dict|null,
    #    "resolved": bool,
    #    "resolved_by": int|null,
    #    "resolved_at": str|null}
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # When the report builder generated this report.
    generated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Accounting review flag — True if the builder flagged issues needing accountant attention.
    needs_accountant_review: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False,
    )

    # Mapping snapshot — pre-computed accounting mappings stored as JSON text.
    # List of {expense_id, account_code, account_name, base_amount, tax_amount,
    #           total_amount, tax_behavior, tax_rate, counter_account_code,
    #           currency, exchange_rate, amount_mxn, dimension_splits, poliza_lines,
    #           balanced, issues, notes}
    mapping_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
