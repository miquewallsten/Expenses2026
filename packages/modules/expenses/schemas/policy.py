from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class CompanyExpensePolicyBase(BaseModel):
    company_id: int
    xml_required_mode: str
    pdf_pair_required_for_cfdi: bool
    international_expenses_allowed: bool
    tickets_allowed: bool
    require_justification: bool
    require_proof: bool
    allow_split_allocations: bool
    allocation_dimensions: str
    manager_approval_required: bool
    accounting_review_required: bool
    ai_policy_assist_enabled: bool


class CompanyExpensePolicyCreate(CompanyExpensePolicyBase):
    pass


class CompanyExpensePolicyUpdate(BaseModel):
    xml_required_mode: Optional[str] = None
    pdf_pair_required_for_cfdi: Optional[bool] = None
    international_expenses_allowed: Optional[bool] = None
    tickets_allowed: Optional[bool] = None
    require_justification: Optional[bool] = None
    require_proof: Optional[bool] = None
    allow_split_allocations: Optional[bool] = None
    allocation_dimensions: Optional[str] = None
    manager_approval_required: Optional[bool] = None
    accounting_review_required: Optional[bool] = None
    ai_policy_assist_enabled: Optional[bool] = None


class CompanyExpensePolicyRead(CompanyExpensePolicyBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
