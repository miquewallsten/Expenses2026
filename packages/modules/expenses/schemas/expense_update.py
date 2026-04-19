from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class ExpenseUpdate(BaseModel):
    amount: Decimal | None = None
    description: str | None = None
    category_code: str | None = None
    expense_date: date | None = None
    notes: str | None = None
    tags: str | None = None
    expense_type: str | None = None
    status: str | None = None
