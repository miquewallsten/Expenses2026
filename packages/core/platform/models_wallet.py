"""Pre-paid wallet model for employee expense funds.

An EmployeeWallet tracks a deposited balance that employees use for expenses.
Each expense deducts from the wallet; reimbursements credit back.
The money is never the employee's — it's a corporate advance managed per-employee.
"""
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.db import Base


class EmployeeWallet(Base):
    """Per-employee pre-paid wallet for expense management."""
    __tablename__ = "employee_wallets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    # Current balance (in MXN). Deducted on expense submission, credited on reimbursement.
    balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0", nullable=False)

    # Total deposited (lifetime). Helps track how much was ever loaded.
    total_deposited: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0", nullable=False)

    # Total spent (lifetime).
    total_spent: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0", nullable=False)

    # Wallet type: "prepaid" (employer-deposited, not the employee's money) or "personal"
    wallet_type: Mapped[str] = mapped_column(String(20), default="prepaid", server_default="prepaid", nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    transactions: Mapped[list["WalletTransaction"]] = relationship(
        "WalletTransaction", back_populates="wallet", lazy="select",
    )


class WalletTransaction(Base):
    """Transaction log for wallet balance changes."""
    __tablename__ = "wallet_transactions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    wallet_id: Mapped[int] = mapped_column(Integer, ForeignKey("employee_wallets.id"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    # Transaction type: "deposit" (admin loads funds), "deduction" (expense submitted),
    # "reimbursement" (funds returned after reimbursement), "adjustment" (manual correction)
    transaction_type: Mapped[str] = mapped_column(String(20), nullable=False)

    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    # Optional link to the expense that triggered this transaction
    expense_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    description: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    # Relationships
    wallet: Mapped["EmployeeWallet"] = relationship(
        "EmployeeWallet", back_populates="transactions",
    )
