from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ExpenseDocumentCreate(BaseModel):
    company_id: int
    expense_id: int | None = None
    filename: str
    content_text: str


class ExpenseDocumentRead(BaseModel):
    id: int
    company_id: int
    expense_id: int | None
    filename: str
    content_text: str
    document_type: str | None
    validation_status: str
    validation_summary: str | None
    extraction_status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
