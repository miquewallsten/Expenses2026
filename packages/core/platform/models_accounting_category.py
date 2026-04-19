from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base

# Allowed values for tax_behavior
TAX_BEHAVIOR_VALUES = ("creditable", "non_creditable", "none")


class AccountingCategory(Base):
    """Expense category → accounting behavior mapping.

    Maps a company-defined category code to the GL accounts and tax treatment
    that should be applied when an expense is coded to that category.

    This is NOT a chart of accounts.  It is a behavior mapping table: given a
    category (e.g. "travel", "meals"), it tells the accounting engine which
    expense and liability accounts to use, how to handle tax, and whether a
    project allocation is mandatory for that category.

    Allowed values
    --------------
    tax_behavior : "creditable" | "non_creditable" | "none"
    """

    __tablename__ = "accounting_categories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(index=True, nullable=False)

    # ── Identity ──────────────────────────────────────────────────────────────
    # code is the short machine-readable key (e.g. "travel", "meals_ent").
    # name is the human-readable label shown in the UI.
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # ── Behavior mapping ──────────────────────────────────────────────────────
    # GL account codes used when posting entries for this category.
    # expense_account_code   — debit side (e.g. "6001-viajes")
    # liability_account_code — credit side / IVA payable (e.g. "2002-iva-pagar")
    expense_account_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    liability_account_code: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # tax_behavior: "creditable" | "non_creditable" | "none"
    # "creditable"     — IVA can be credited against output tax
    # "non_creditable" — IVA cannot be credited (e.g. entertainment meals)
    # "none"           — no IVA component for this category
    tax_behavior: Mapped[str] = mapped_column(
        String(20), default="none", server_default="none", nullable=False
    )

    # When True, expenses coded to this category must have at least one
    # ExpenseAllocation row with a non-null project_id before they can be
    # posted or used in póliza generation.
    requires_project: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # ── Metadata ──────────────────────────────────────────────────────────────
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
