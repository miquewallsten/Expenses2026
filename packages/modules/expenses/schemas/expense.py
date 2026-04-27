from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, field_serializer


class ExpenseCreate(BaseModel):
    company_id: int
    amount: Decimal
    description: str
    # Phase 2.4 — caller-supplied classification. Validated against active
    # AccountingCategory rows in expense_service.create_expense.
    category_code: str | None = None


class ExpenseRead(BaseModel):
    id: int
    company_id: int
    amount: Decimal
    description: str
    status: str
    mapping_snapshot: str | None
    detected_category: str | None
    report_id: int | None
    account_code: str | None
    category_code: str | None = None
    expense_date: date | None = None
    created_at: datetime
    accounting_explanation: dict | None = None
    notes: str | None = None
    tags: str | None = None          # JSON string: ["tag1","tag2"]
    expense_type: str | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("amount")
    def serialize_amount(self, v: Decimal) -> float:
        """Serialize amount as a JSON number (not a string) so frontend receives a float."""
        return float(v)
