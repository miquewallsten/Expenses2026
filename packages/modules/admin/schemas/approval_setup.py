from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ApprovalSetupBase(BaseModel):
    company_id: int
    approval_mode: str = "none"
    manager_threshold_amount: float | None = None
    require_manager_for_all_employees: bool = False
    require_accounting_for_all_expenses: bool = True
    allow_resubmission_after_rejection: bool = True
    escalate_policy_failures_to_accounting: bool = True
    escalate_international_to_accounting: bool = True


class ApprovalSetupCreate(ApprovalSetupBase):
    pass


class ApprovalSetupUpdate(BaseModel):
    approval_mode: str | None = None
    manager_threshold_amount: float | None = None
    require_manager_for_all_employees: bool | None = None
    require_accounting_for_all_expenses: bool | None = None
    allow_resubmission_after_rejection: bool | None = None
    escalate_policy_failures_to_accounting: bool | None = None
    escalate_international_to_accounting: bool | None = None


class ApprovalSetupRead(ApprovalSetupBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
