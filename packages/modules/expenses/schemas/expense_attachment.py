from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ExpenseAttachmentCreate(BaseModel):
    expense_id: int
    attachment_type: str
    filename: str
    content_text: str


class ExpenseAttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    expense_id: int
    attachment_type: str
    filename: str
    content_text: str
    created_at: datetime
