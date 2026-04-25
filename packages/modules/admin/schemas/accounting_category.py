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
    # Legacy string fields (Phase E will retire).
    expense_account_code: str | None
    liability_account_code: str | None
    tax_behavior: str
    # Phase A FKs to the real CoA + tax-rate tables.
    expense_account_id: int | None = None
    tax_rate_id: int | None = None
    counterparty_account_id: int | None = None
    requires_project: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AccountingCategoryBindingPatch(BaseModel):
    """Update only the CoA + tax-rate bindings on an existing category.

    Used by the Motor de Pólizas UI when an admin reassigns a category's
    expense / tax / counterparty accounts. Pass `None` to clear a slot.
    """
    expense_account_id: int | None = None
    tax_rate_id: int | None = None
    counterparty_account_id: int | None = None
