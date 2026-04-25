"""accounting_accounts — per-company Chart of Accounts.

A postable account is a leaf in the tree that journal entries can hit. A
non-postable account is a header (Class/Group) used for presentation.

SAT Código Agrupador (Anexo 24): every Mexican company account should carry
the SAT grouping code it rolls up to. We store it verbatim on each row.

Dimension splits (`split_by`): when set, the póliza exporter will suffix the
code with the expense's cost-center / project / client code. The database
still stores one row per base account; expansion happens at export time.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


# Allowed values
ACCOUNT_CLASS_VALUES  = ("asset", "liability", "equity", "income", "cost", "expense", "result", "memoranda")
SPLIT_BY_VALUES       = ("none", "cost_center", "project", "client")


class AccountingAccount(Base):
    __tablename__ = "accounting_accounts"
    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_accounting_accounts_company_code"),
    )

    id:         Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), index=True, nullable=False)

    # Internal code shown to the admin (e.g. "601.01"). Treated as the
    # canonical identifier within a company.
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Parent row for hierarchy (class → group → account → subaccount).
    parent_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("accounting_accounts.id", ondelete="CASCADE"), nullable=True, index=True,
    )

    # SAT Anexo 24 Código Agrupador (e.g. "601.01"). Nullable because the
    # opinionated preset can omit it until the admin turns SAT mode on.
    sat_group_code: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)

    # One of ACCOUNT_CLASS_VALUES.
    account_class: Mapped[str] = mapped_column(String(20), nullable=False, default="expense", server_default="expense")

    # True = can appear in a journal entry. False = header/rollup only.
    is_postable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    # Dimension split for export-time suffixing.
    split_by: Mapped[str] = mapped_column(String(20), nullable=False, default="none", server_default="none")

    sort_order: Mapped[int]  = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_active:  Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
