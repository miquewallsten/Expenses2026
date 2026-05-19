"""Pre-paid wallet service for employee expense funds.

Manages wallet balances, deposits, deductions, and reimbursements.
All operations are transactional — balance changes always have a matching
WalletTransaction row for audit.
"""
from __future__ import annotations

from decimal import Decimal
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from packages.core.platform.models_wallet import EmployeeWallet, WalletTransaction


class WalletService:
    """Manages pre-paid employee wallets for expense management."""

    @staticmethod
    def get_or_create_wallet(db: Session, company_id: int, user_id: int) -> EmployeeWallet:
        """Get existing wallet or create one with zero balance."""
        wallet = (
            db.query(EmployeeWallet)
            .filter(
                EmployeeWallet.company_id == company_id,
                EmployeeWallet.user_id == user_id,
                EmployeeWallet.is_active == True,
            )
            .first()
        )
        if wallet is None:
            wallet = EmployeeWallet(
                company_id=company_id,
                user_id=user_id,
                balance=Decimal("0"),
                total_deposited=Decimal("0"),
                total_spent=Decimal("0"),
            )
            db.add(wallet)
            db.flush()
        return wallet

    @staticmethod
    def deposit(
        db: Session,
        company_id: int,
        user_id: int,
        amount: Decimal,
        description: str | None = None,
    ) -> EmployeeWallet:
        """Admin deposits funds into an employee's wallet."""
        if amount <= 0:
            raise ValueError("Deposit amount must be positive")

        wallet = WalletService.get_or_create_wallet(db, company_id, user_id)
        wallet.balance += amount
        wallet.total_deposited += amount

        tx = WalletTransaction(
            company_id=company_id,
            wallet_id=wallet.id,
            user_id=user_id,
            transaction_type="deposit",
            amount=amount,
            balance_after=wallet.balance,
            description=description or "Wallet deposit",
        )
        db.add(tx)
        db.flush()
        return wallet

    @staticmethod
    def deduct(
        db: Session,
        company_id: int,
        user_id: int,
        amount: Decimal,
        expense_id: int | None = None,
        description: str | None = None,
    ) -> EmployeeWallet:
        """Deduct funds when an expense is submitted from the wallet."""
        if amount <= 0:
            raise ValueError("Deduction amount must be positive")

        wallet = WalletService.get_or_create_wallet(db, company_id, user_id)
        if wallet.balance < amount:
            raise ValueError(
                f"Insufficient wallet balance: {wallet.balance} < {amount}"
            )

        wallet.balance -= amount
        wallet.total_spent += amount

        tx = WalletTransaction(
            company_id=company_id,
            wallet_id=wallet.id,
            user_id=user_id,
            transaction_type="deduction",
            amount=amount,
            balance_after=wallet.balance,
            expense_id=expense_id,
            description=description or f"Expense deduction",
        )
        db.add(tx)
        db.flush()
        return wallet

    @staticmethod
    def reimburse(
        db: Session,
        company_id: int,
        user_id: int,
        amount: Decimal,
        expense_id: int | None = None,
        description: str | None = None,
    ) -> EmployeeWallet:
        """Credit funds back to the wallet when an expense is reimbursed."""
        if amount <= 0:
            raise ValueError("Reimbursement amount must be positive")

        wallet = WalletService.get_or_create_wallet(db, company_id, user_id)
        wallet.balance += amount
        # total_spent is NOT reduced — it tracks lifetime spend

        tx = WalletTransaction(
            company_id=company_id,
            wallet_id=wallet.id,
            user_id=user_id,
            transaction_type="reimbursement",
            amount=amount,
            balance_after=wallet.balance,
            expense_id=expense_id,
            description=description or "Wallet reimbursement",
        )
        db.add(tx)
        db.flush()
        return wallet

    @staticmethod
    def get_balance(db: Session, company_id: int, user_id: int) -> Decimal:
        """Return current wallet balance (0 if no wallet exists)."""
        wallet = (
            db.query(EmployeeWallet)
            .filter(
                EmployeeWallet.company_id == company_id,
                EmployeeWallet.user_id == user_id,
                EmployeeWallet.is_active == True,
            )
            .first()
        )
        return wallet.balance if wallet else Decimal("0")

    @staticmethod
    def adjust(
        db: Session,
        company_id: int,
        user_id: int,
        amount: Decimal,
        description: str | None = None,
    ) -> EmployeeWallet:
        """Manual adjustment (positive or negative) by admin."""
        wallet = WalletService.get_or_create_wallet(db, company_id, user_id)
        wallet.balance += amount

        tx = WalletTransaction(
            company_id=company_id,
            wallet_id=wallet.id,
            user_id=user_id,
            transaction_type="adjustment",
            amount=amount,
            balance_after=wallet.balance,
            description=description or "Manual adjustment",
        )
        db.add(tx)
        db.flush()
        return wallet


WALLET_SERVICE = WalletService()
