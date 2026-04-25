from typing import Literal

from pydantic import BaseModel


# Phase 2.2: tighten request schema. Mirrors the values produced by the
# extraction / validation pipelines so a hand-crafted PATCH cannot park a
# document in an unknown state.
ExtractionStatus = Literal["pending", "processing", "succeeded", "failed"]
ValidationStatus = Literal["pending", "passed", "warning", "failed"]


class ExpenseDocumentUpdate(BaseModel):
    expense_id: int | None = None
    extraction_status: ExtractionStatus | None = None
    validation_status: ValidationStatus | None = None
