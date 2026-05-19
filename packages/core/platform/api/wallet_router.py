"""Wallet management API endpoints.

Pre-paid wallet for employee expense funds. Admin deposits, auto-deduct on
expense submission, auto-reimburse on approval.
"""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_admin, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.models_wallet import EmployeeWallet, WalletTransaction
from packages.core.platform.service_wallet import WALLET_SERVICE

router = APIRouter(prefix="/wallet", tags=["wallet"])


# ── Schemas ─────────────────────────────────────────────────────────────────

class WalletRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_id: int
    user_id: int
    balance: Decimal
    total_deposited: Decimal
    total_spent: Decimal
    wallet_type: str
    is_active: bool


class WalletTransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_id: int
    wallet_id: int
    user_id: int
    transaction_type: str
    amount: Decimal
    balance_after: Decimal
    expense_id: int | None
    description: str | None


class DepositRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: int
    amount: Decimal = Field(..., gt=0)
    description: str | None = None


class AdjustmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: int
    amount: Decimal
    description: str | None = None


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/{company_id}/balance/{user_id}", response_model=WalletRead)
def get_wallet(
    company_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get or create a wallet for a user."""
    require_same_company(company_id, current_user)
    wallet = WALLET_SERVICE.get_or_create_wallet(db, company_id, user_id)
    return wallet


@router.post("/{company_id}/deposit", response_model=WalletRead)
def deposit_to_wallet(
    company_id: int,
    body: DepositRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Admin deposits funds into an employee's wallet."""
    require_same_company(company_id, current_user)
    try:
        wallet = WALLET_SERVICE.deposit(
            db=db,
            company_id=company_id,
            user_id=body.user_id,
            amount=body.amount,
            description=body.description,
        )
        db.commit()
        return wallet
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{company_id}/adjust", response_model=WalletRead)
def adjust_wallet(
    company_id: int,
    body: AdjustmentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Admin adjusts wallet balance (positive or negative)."""
    require_same_company(company_id, current_user)
    try:
        wallet = WALLET_SERVICE.adjust(
            db=db,
            company_id=company_id,
            user_id=body.user_id,
            amount=body.amount,
            description=body.description,
        )
        db.commit()
        return wallet
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{company_id}/transactions/{user_id}", response_model=list[WalletTransactionRead])
def list_wallet_transactions(
    company_id: int,
    user_id: int,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List wallet transaction history for a user."""
    require_same_company(company_id, current_user)
    wallet = WALLET_SERVICE.get_or_create_wallet(db, company_id, user_id)
    txs = (
        db.query(WalletTransaction)
        .filter(WalletTransaction.wallet_id == wallet.id)
        .order_by(WalletTransaction.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return txs
