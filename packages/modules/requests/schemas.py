from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict


class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class PurchaseRequestBase(BaseModel):
    request_type: str | None = None
    title: str | None = None
    priority: str = "normal"
    estimated_amount: Decimal | None = None
    currency: str | None = None


class PurchaseRequestRead(PurchaseRequestBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    requester_id: int
    requester_name: str | None = None
    request_no: str | None = None
    status: str
    details: dict[str, Any] | None = None
    conversation: list[ChatMessage] | None = None
    research: list[dict[str, Any]] | None = None
    assigned_team: str | None = None
    reviewer_notes: str | None = None
    rejection_reason: str | None = None
    submitted_at: datetime | None = None
    viewed_at: datetime | None = None
    reviewed_at: datetime | None = None
    fulfilled_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AIChatRequest(BaseModel):
    message: str
    research: bool = False


class AIChatResponse(BaseModel):
    reply: str
    extracted_fields: dict[str, Any] | None = None
    ready_to_submit: bool = False
    research_results: list[dict[str, Any]] | None = None
    request_id: int
    title: str | None = None
    request_type: str | None = None


class PurchaseRequestUpdate(BaseModel):
    """PATCH body — all fields optional; only provided fields are applied."""
    title: str | None = None
    request_type: str | None = None
    priority: str | None = None
    estimated_amount: Decimal | None = None
    currency: str | None = None
    details: dict[str, Any] | None = None


class ReviewAction(BaseModel):
    notes: str | None = None
    rejection_reason: str | None = None


class AttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    request_id: int
    attachment_type: str
    original_name: str | None = None
    file_size: int | None = None
    mime_type: str | None = None
    url: str | None = None
    label: str | None = None
    created_at: datetime


class AddUrlAttachment(BaseModel):
    url: str
    label: str | None = None
