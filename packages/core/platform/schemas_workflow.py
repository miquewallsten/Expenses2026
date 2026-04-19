from datetime import datetime

from pydantic import BaseModel, ConfigDict


class WorkflowStageCreate(BaseModel):
    company_id: int
    module_key: str
    stage_key: str
    stage_name: str
    stage_order: int
    is_terminal: bool = False


class WorkflowStageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    module_key: str
    stage_key: str
    stage_name: str
    stage_order: int
    is_terminal: bool
    created_at: datetime


class WorkflowTransitionCreate(BaseModel):
    company_id: int
    module_key: str
    from_stage_key: str
    to_stage_key: str
    action_key: str
    required_permission_key: str


class WorkflowTransitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    module_key: str
    from_stage_key: str
    to_stage_key: str
    action_key: str
    required_permission_key: str
    created_at: datetime
