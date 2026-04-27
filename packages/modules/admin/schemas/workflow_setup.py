"""WIP stub — workflow setup schema."""
from pydantic import BaseModel, ConfigDict


class WorkflowSetupRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    company_id: int
    default_expense_workflow_mode: str = "standard"
    block_submit_on_failed_validation: bool = False
    route_policy_failures_to: str = "none"
