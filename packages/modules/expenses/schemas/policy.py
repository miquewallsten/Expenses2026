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
    allow_document_free_expenses: bool = False


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
    allow_document_free_expenses: Optional[bool] = None


class CompanyExpensePolicyRead(CompanyExpensePolicyBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
