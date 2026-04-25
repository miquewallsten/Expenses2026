from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base

# Allowed values for tax_behavior
TAX_BEHAVIOR_VALUES = ("creditable", "non_creditable", "none")


class AccountingCategory(Base):
    """Expense category → accounting behavior mapping.

    Maps a company-defined category code to the GL accounts and tax treatment
    that should be applied when an expense is coded to that category.

    Modern shape (Phase A+): `expense_account_id` FK → accounting_accounts,
    `tax_rate_id` FK → tax_rates, optional `counterparty_account_id` FK.
    Legacy string columns (expense_account_code, liability_account_code,
    tax_behavior) are kept until Phase E so existing exports don't break.
    """

    __tablename__ = "accounting_categories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(index=True, nullable=False)

    # ── Identity ──────────────────────────────────────────────────────────────
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # ── Modern FK-based mapping (Phase A+) ────────────────────────────────────
    expense_account_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("accounting_accounts.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    tax_rate_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("tax_rates.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    counterparty_account_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("accounting_accounts.id", ondelete="SET NULL"), nullable=True,
    )

    # ── Legacy string columns (retired in Phase E) ────────────────────────────
    expense_account_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    liability_account_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tax_behavior: Mapped[str] = mapped_column(
        String(20), default="none", server_default="none", nullable=False
    )

    requires_project: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # ── Metadata ──────────────────────────────────────────────────────────────
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
