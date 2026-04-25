"""Pydantic schemas for the Amex Reconciliation API."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict


class StatementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    reconciler_id: int | None
    filename: str
    period_start: date | None
    period_end: date | None
    card_last4: str | None
    currency: str
    total_amount: Decimal
    line_count: int
    status: str
    submitted_at: datetime | None
    expense_id: int | None
    report_id: int | None
    notes: str | None
    created_at: datetime
    # Derived (filled by service):
    matched_count: int = 0
    no_invoice_count: int = 0
    missing_count: int = 0
    unmatched_count: int = 0
    document_count: int = 0


class LineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    statement_id: int
    line_no: int
    posted_date: date | None
    description: str
    merchant: str | None
    amount: Decimal
    currency: str
    reference: str | None
    project_id: int | None
    cost_center_id: int | None
    category_code: str | None
    notes: str | None
    matched_document_id: int | None
    match_confidence: str
    status: str


class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    statement_id: int
    xml_filename: str | None
    pdf_filename: str | None
    uuid: str | None
    emisor_rfc: str | None
    emisor_name: str | None
    receptor_rfc: str | None
    total: Decimal | None
    invoice_date: date | None
    sat_status: str | None
    validation_status: str
    validation_error: str | None
    created_at: datetime
    # Derived
    matched_line_id: int | None = None


class StatementDetail(BaseModel):
    statement: StatementRead
    lines: list[LineRead]
    documents: list[DocumentRead]


class LinePatch(BaseModel):
    project_id: int | None = None
    cost_center_id: int | None = None
    category_code: str | None = None
    notes: str | None = None
    status: Literal["unmatched", "matched", "no_invoice", "missing"] | None = None


class BulkAssign(BaseModel):
    line_ids: list[int]
    project_id: int | None = None
    cost_center_id: int | None = None
    category_code: str | None = None
    status: Literal["unmatched", "matched", "no_invoice", "missing"] | None = None


class MatchRequest(BaseModel):
    document_id: int


class AutoMatchResult(BaseModel):
    matched: int
    total_lines: int
    total_documents: int


class SubmitResponse(BaseModel):
    statement_id: int
    expense_id: int
    report_id: int
    status: str
