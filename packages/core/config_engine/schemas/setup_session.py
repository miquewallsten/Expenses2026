from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SetupSessionCreate(BaseModel):
    company_id: int


class SetupSessionRead(BaseModel):
    id: int
    company_id: int
    status: str
    current_stage: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
