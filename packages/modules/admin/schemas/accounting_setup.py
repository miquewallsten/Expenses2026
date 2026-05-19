from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AccountingSetupBase(BaseModel):
    company_id: int
    accounting_review_mode: str = "all"
    manager_approval_mode: str = "disabled"
    manager_approval_threshold_amount: float | None = None
    reimbursement_entity_required: bool = False
    poliza_required: bool = False
    archive_retention_years: int = 5
    account_code_required: bool = False
    subaccount_required: bool = False
    auto_account_suggestion_enabled: bool = True
    cost_center_required: bool = False
    project_required: bool = False
    client_required: bool = False
    allow_accounting_override: bool = True
    allow_submit_with_warnings: bool = False
    require_final_accounting_review_before_export: bool = True
    ai_accounting_assist_enabled: bool = True
    ai_accounting_notes: str | None = None
    setup_mode: str = "setup"
    configured_by: str | None = None
    last_configured_by: str | None = None
    last_configured_at: datetime | None = None


class AccountingSetupCreate(AccountingSetupBase):
    pass


class AccountingSetupUpdate(BaseModel):
    accounting_review_mode: str | None = None
    manager_approval_mode: str | None = None
    manager_approval_threshold_amount: float | None = None
    reimbursement_entity_required: bool | None = None
    poliza_required: bool | None = None
    archive_retention_years: int | None = None
    account_code_required: bool | None = None
    subaccount_required: bool | None = None
    auto_account_suggestion_enabled: bool | None = None
    cost_center_required: bool | None = None
    project_required: bool | None = None
    client_required: bool | None = None
    allow_accounting_override: bool | None = None
    allow_submit_with_warnings: bool | None = None
    require_final_accounting_review_before_export: bool | None = None
    ai_accounting_assist_enabled: bool | None = None
    ai_accounting_notes: str | None = None
    setup_mode: str | None = None
    configured_by: str | None = None
    last_configured_by: str | None = None
    last_configured_at: datetime | None = None


class AccountingSetupRead(AccountingSetupBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
