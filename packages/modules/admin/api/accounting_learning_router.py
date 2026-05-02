from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_admin, require_same_company
from packages.core.platform.models_user import User
from apps.api.deps import get_db
from packages.core.platform.models_accounting_learning import AccountingLearning

router = APIRouter(prefix="/admin/accounting-learning", tags=["admin"], dependencies=[Depends(require_admin)])


class AccountingLearningRead(BaseModel):
    input_text: str
    category_code: str | None
    account_code: str | None
    usage_count: int

    model_config = {"from_attributes": True}


@router.get("/{company_id}", response_model=list[AccountingLearningRead])
def list_accounting_learning(company_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)):
    rows = (
        db.query(AccountingLearning)
        .filter(AccountingLearning.company_id == company_id)
        .order_by(AccountingLearning.usage_count.desc())
        .all()
    )
    return rows

def list_accounting_learning(company_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(AccountingLearning)
        .filter(AccountingLearning.company_id == company_id)
        .order_by(AccountingLearning.usage_count.desc())
        .all()
    )
    return rows
