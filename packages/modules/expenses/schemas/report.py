from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ExpenseReportCreate(BaseModel):
    company_id: int
    title: str


class ExpenseReportRead(BaseModel):
    id: int
    company_id: int
    title: str
    status: str
    user_id: int | None = None
    period_start: date | None = None
    period_end: date | None = None
    triggered_by: str = "user"
    cycle_settings_id: int | None = None
    total_amount: Decimal | None = None
    expense_count: int | None = None
    currency: str = "MXN"
    settlement_type: str = "reimbursable"
    notes: str | None = None
    generated_at: datetime | None = None
    needs_accountant_review: bool = False
    mapping_snapshot: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExpenseReportDetail(ExpenseReportRead):
    """Full detail including parsed notes and mapping snapshot."""
    parsed_notes: list[dict[str, Any]] = []
    parsed_mapping: list[dict[str, Any]] = []


class ReportBuildRequest(BaseModel):
    """Request to manually trigger report building."""
    company_id: int
    user_id: int | None = None
    period_start: date | None = None
    period_end: date | None = None
    triggered_by: str = "manual"


class ReportIssueResolve(BaseModel):
    """Resolve a flagged issue on a report."""
    issue_index: int = Field(..., ge=0, description="Index of the issue in the notes array to resolve")
    resolution: str = Field(..., min_length=1, description="Accountant's resolution note")
    action: str = Field(default="acknowledge", description="acknowledge | remap | exclude_expense")
    new_account_code: str | None = Field(None, description="New account code if action=remap")
    exclude_expense_id: int | None = Field(None, description="Expense ID to exclude if action=exclude_expense")


class PolizaRead(BaseModel):
    id: int
    report_id: int
    company_id: int
    status: str
    period: str | None = None
    format: str = "coi"
    line_items: str | None = None
    total_debit: Decimal | None = None
    total_credit: Decimal | None = None
    balanced: bool = False
    notes: str | None = None
    content_text: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
