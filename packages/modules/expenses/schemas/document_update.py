from pydantic import BaseModel


class ExpenseDocumentUpdate(BaseModel):
    expense_id: int | None = None
    extraction_status: str | None = None
    validation_status: str | None = None
