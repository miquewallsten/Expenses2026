from datetime import datetime

from pydantic import BaseModel, ConfigDict


class WorkflowSetupBase(BaseModel):
    company_id: int
    default_expense_workflow_mode: str = "standard"
    auto_submit_on_complete_upload: bool = False
    block_submit_on_failed_validation: bool = True
    allow_submit_with_warnings: bool = False
    auto_assign_review_stage: bool = True
    route_policy_failures_to: str = "accounting"
    route_missing_documents_to: str = "employee"
    route_international_expenses_to: str = "accounting"
    allow_draft_save: bool = True
    allow_resubmit_after_return: bool = True
    show_next_action_guidance: bool = True
    ai_workflow_assist_enabled: bool = True
    ai_workflow_notes: str | None = None


class WorkflowSetupCreate(WorkflowSetupBase):
    pass


class WorkflowSetupUpdate(BaseModel):
    default_expense_workflow_mode: str | None = None
    auto_submit_on_complete_upload: bool | None = None
    block_submit_on_failed_validation: bool | None = None
    allow_submit_with_warnings: bool | None = None
    auto_assign_review_stage: bool | None = None
    route_policy_failures_to: str | None = None
    route_missing_documents_to: str | None = None
    route_international_expenses_to: str | None = None
    allow_draft_save: bool | None = None
    allow_resubmit_after_return: bool | None = None
    show_next_action_guidance: bool | None = None
    ai_workflow_assist_enabled: bool | None = None
    ai_workflow_notes: str | None = None


class WorkflowSetupRead(WorkflowSetupBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
