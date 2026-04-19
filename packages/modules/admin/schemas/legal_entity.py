from datetime import datetime

from pydantic import BaseModel, ConfigDict


class LegalEntityBase(BaseModel):
    company_id: int
    entity_name: str
    entity_code: str | None = None
    country_code: str | None = None
    base_currency: str | None = None
    legal_name: str | None = None
    tax_id: str | None = None
    rfc: str | None = None
    fiscal_regime: str | None = None
    fiscal_zip_code: str | None = None
    fiscal_address: str | None = None
    is_reimbursement_entity: bool = False
    is_invoice_receiver_entity: bool = False
    is_active: bool = True


class LegalEntityCreate(LegalEntityBase):
    pass


class LegalEntityUpdate(BaseModel):
    entity_name: str | None = None
    entity_code: str | None = None
    country_code: str | None = None
    base_currency: str | None = None
    legal_name: str | None = None
    tax_id: str | None = None
    rfc: str | None = None
    fiscal_regime: str | None = None
    fiscal_zip_code: str | None = None
    fiscal_address: str | None = None
    is_reimbursement_entity: bool | None = None
    is_invoice_receiver_entity: bool | None = None
    is_active: bool | None = None


class LegalEntityRead(LegalEntityBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
