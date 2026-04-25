"""Phase 2.2 — request schema strictness.

Each request schema should reject unknown literal values at the edge with
a 422 / Pydantic ValidationError, instead of letting a hand-crafted state
slip into the database.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from packages.modules.expenses.schemas.document_update import (
    ExpenseDocumentUpdate,
)
from packages.modules.expenses.schemas.expense_update import ExpenseUpdate


# ── ExpenseUpdate.status ────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "value",
    [
        "draft",
        "submitted",
        "manager_approved",
        "approved",
        "rejected",
        "returned",
    ],
)
def test_expense_update_accepts_known_status(value: str) -> None:
    obj = ExpenseUpdate(status=value)
    assert obj.status == value


@pytest.mark.parametrize("value", ["paid", "deleted", "DRAFT", "x", ""])
def test_expense_update_rejects_unknown_status(value: str) -> None:
    with pytest.raises(ValidationError):
        ExpenseUpdate(status=value)


def test_expense_update_status_optional() -> None:
    obj = ExpenseUpdate()
    assert obj.status is None


def test_expense_update_amount_must_be_positive() -> None:
    with pytest.raises(ValidationError):
        ExpenseUpdate(amount=0)
    with pytest.raises(ValidationError):
        ExpenseUpdate(amount=-5)


# ── ExpenseDocumentUpdate ───────────────────────────────────────────────────


@pytest.mark.parametrize(
    "value", ["pending", "processing", "succeeded", "failed"]
)
def test_document_update_accepts_known_extraction(value: str) -> None:
    obj = ExpenseDocumentUpdate(extraction_status=value)
    assert obj.extraction_status == value


@pytest.mark.parametrize(
    "value", ["pending", "passed", "warning", "failed"]
)
def test_document_update_accepts_known_validation(value: str) -> None:
    obj = ExpenseDocumentUpdate(validation_status=value)
    assert obj.validation_status == value


@pytest.mark.parametrize("value", ["unknown", "PENDING", "ok", ""])
def test_document_update_rejects_unknown_extraction(value: str) -> None:
    with pytest.raises(ValidationError):
        ExpenseDocumentUpdate(extraction_status=value)
