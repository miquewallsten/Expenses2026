from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AccountingCategoryCreate(BaseModel):
    company_id: int
    code: str
    name: str
    expense_account_code: str | None = None
    liability_account_code: str | None = None
    tax_behavior: str = "none"
    requires_project: bool = False


class AccountingCategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    code: str
    name: str
    expense_account_code: str | None
    liability_account_code: str | None
    tax_behavior: str
    requires_project: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
