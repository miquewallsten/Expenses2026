from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ApprovalSetupBase(BaseModel):
    company_id: int
    approval_mode: str = "none"
    manager_threshold_amount: float | None = None
    accounting_threshold_amount: float | None = None
    require_manager_for_all_employees: bool = False
    require_accounting_for_all_expenses: bool = True
    allow_self_submission_without_manager: bool = True
    allow_resubmission_after_rejection: bool = True
    escalate_policy_failures_to_accounting: bool = True
    escalate_international_to_accounting: bool = True
    escalate_missing_documents_to_manager: bool = False
    ai_approval_assist_enabled: bool = True
    ai_approval_notes: str | None = None


class ApprovalSetupCreate(ApprovalSetupBase):
    pass


class ApprovalSetupUpdate(BaseModel):
    approval_mode: str | None = None
    manager_threshold_amount: float | None = None
    accounting_threshold_amount: float | None = None
    require_manager_for_all_employees: bool | None = None
    require_accounting_for_all_expenses: bool | None = None
    allow_self_submission_without_manager: bool | None = None
    allow_resubmission_after_rejection: bool | None = None
    escalate_policy_failures_to_accounting: bool | None = None
    escalate_international_to_accounting: bool | None = None
    escalate_missing_documents_to_manager: bool | None = None
    ai_approval_assist_enabled: bool | None = None
    ai_approval_notes: str | None = None


class ApprovalSetupRead(ApprovalSetupBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
