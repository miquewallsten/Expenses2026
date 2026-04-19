from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ExpenseAllocationCreate(BaseModel):
    expense_id: int
    project_id: Optional[int] = None
    client_id: Optional[int] = None
    cost_center_id: Optional[int] = None
    percent: float


class ExpenseAllocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    expense_id: int
    project_id: Optional[int]
    client_id: Optional[int]
    cost_center_id: Optional[int]
    percent: float
    created_at: datetime
