from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.modules.expenses.schemas.policy import (
    CompanyExpensePolicyCreate,
    CompanyExpensePolicyRead,
    CompanyExpensePolicyUpdate,
)
from packages.modules.expenses.service.policy_service import (
    get_or_create_company_expense_policy,
    upsert_company_expense_policy,
)

router = APIRouter(prefix="/expenses/policy", tags=["expenses-policy"])


@router.get("/{company_id}", response_model=CompanyExpensePolicyRead)
def get_policy(company_id: int, db: Session = Depends(get_db)):
    return get_or_create_company_expense_policy(db, company_id)


@router.put("/{company_id}", response_model=CompanyExpensePolicyRead)
def upsert_policy(company_id: int, payload: CompanyExpensePolicyUpdate, db: Session = Depends(get_db)):
    return upsert_company_expense_policy(db, company_id, payload)
