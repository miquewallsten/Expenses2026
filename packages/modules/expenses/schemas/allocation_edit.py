from typing import Optional

from pydantic import BaseModel, ConfigDict


class AllocationEditItem(BaseModel):
    project_id: Optional[int] = None
    client_id: Optional[int] = None
    cost_center_id: Optional[int] = None
    percent: float


class AllocationEditItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: Optional[int]
    client_id: Optional[int]
    cost_center_id: Optional[int]
    percent: float


class ExpenseAllocationReplaceRequest(BaseModel):
    items: list[AllocationEditItem]


class ExpenseAllocationReplaceResponse(BaseModel):
    expense_id: int
    items: list[AllocationEditItemRead]
