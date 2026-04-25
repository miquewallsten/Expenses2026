from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


# Phase 2.2: tighten request schema. Only the values the transition layer
# can actually accept are valid here — anything else is a 422 at the edge,
# not a 500 deeper in the call stack.
ExpenseStatus = Literal[
    "draft",
    "submitted",
    "manager_approved",
    "approved",
    "rejected",
    "returned",
]


class ExpenseUpdate(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, max_length=500)
    category_code: str | None = Field(default=None, max_length=64)
    expense_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    tags: str | None = Field(default=None, max_length=500)
    expense_type: str | None = Field(default=None, max_length=40)
    status: ExpenseStatus | None = None
