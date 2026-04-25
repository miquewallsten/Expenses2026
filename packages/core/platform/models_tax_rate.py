"""tax_rates — named VAT/tax rates per company.

Each rate carries its behavior (trasladado, acreditable, no_acreditable,
retenido, exento) and the GL account it posts to. Accounting categories
reference a rate by FK, so a rate-change updates every mapping at once.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


# Allowed values
TAX_BEHAVIOR_VALUES = (
    "trasladable",      # IVA trasladado (output tax, sale side)
    "acreditable",      # IVA acreditable (input tax, can be credited)
    "no_acreditable",   # IVA paid, cannot be credited → expensed
    "retenido",         # ISR/IVA retention
    "exento",           # 0% or exempt
)


class TaxRate(Base):
    __tablename__ = "tax_rates"
    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_tax_rates_company_name"),
    )

    id:         Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), index=True, nullable=False)

    # Human-readable and unique within the company (e.g. "IVA 16% Acreditable").
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    # Rate as a decimal (0.16, 0.08, 0.1067, 0.0). Negative retentions are
    # stored as positive values — the behavior field distinguishes them.
    rate: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False)

    # One of TAX_BEHAVIOR_VALUES.
    behavior: Mapped[str] = mapped_column(String(20), nullable=False)

    # GL account the tax posts to. Nullable for "no_acreditable" (which lands
    # in the expense account itself) and "exento" (no posting).
    gl_account_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("accounting_accounts.id", ondelete="SET NULL"), nullable=True,
    )

    is_active:  Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
