"""Expense Validation Agent tool registration.

Provides a single tool `expense_validation` that validates a single uploaded
ExpenseDocument (XML or PDF) using the existing validation pipeline and
CFDI‑pairing logic.
"""

from __future__ import annotations

from typing import Any, Dict

from pydantic import BaseModel, ConfigDict, Field

from packages.modules.expenses.service.validation_engine import run_validation_pipeline
from packages.modules.expenses.service.document_matching_service import (
    find_best_pdf_match_for_xml,
    find_best_pdf_match_for_xml,
)
from packages.modules.expenses.models.document import ExpenseDocument

from ..core.context import AgentContext
from ..core.registry import REGISTRY, ToolResult, ToolSpec

# ---------------------------------------------------------------------------
# Input schema for the tool – the agent passes a document ID.
# ---------------------------------------------------------------------------

class _ValidateArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_id: int = Field(..., description="ExpenseDocument primary key to validate")

# ---------------------------------------------------------------------------
# Core handler – runs the full validation pipeline and returns a summary.
# ---------------------------------------------------------------------------

def _expense_validation(ctx: AgentContext, args: _ValidateArgs) -> ToolResult:
    db = ctx.db
    # Load the document – must belong to the same company as the agent context.
    document: ExpenseDocument | None = (
        db.query(ExpenseDocument)
        .filter(
            ExpenseDocument.id == args.document_id,
            ExpenseDocument.company_id == ctx.company_id,
        )
        .first()
    )
    if document is None:
        return ToolResult(
            ok=False,
            summary="Document not found or out of scope",
            error="not_found",
        )
    
    # 1. DETERMINISTIC PIPELINE START
    # Ensure we have extracted data first.
    extracted: Dict[str, Any] = getattr(document, "extracted", {}) or {}
    
    # 2. RUN VALIDATION PIPELINE (SAT, Policy, UUID check)
    results = run_validation_pipeline(db, document, extracted)
    
    # 3. ENFORCE PAIRING (The "Identity Gate")
    # High-priority: Every XML MUST have a PDF counterpart and vice versa.
    if document.document_type == "cfdi_xml":
        pair = find_best_pdf_match_for_xml(db, document.company_id, document.id)
        paired = pair is not None
    elif document.document_type in {"cfdi_pdf", "pdf_unclassified", "ticket"}:
        pair = find_best_pdf_match_for_xml(db, document.company_id, document.id)
        paired = pair is not None
    else:
        paired = False

    # 4. ANALYZE RESULTS (The "Decision Engine")
    passed = sum(1 for r in results if r.status == "passed")
    warnings = sum(1 for r in results if r.status == "warning")
    failed = sum(1 for r in results if r.status == "failed")
    
    # CRITICAL FAILURES: If something is 'failed' in the pipeline (like DUPLICATE_UUID or SAT_CANCELED),
    # the document is NOT valid regardless of pairing.
    is_critically_failed = any(r.status == "failed" for r in results)
    
    # A document is "Fully Verified" only if no failures AND it is paired.
    is_fully_verified = not is_critically_failed and paired

    # 5. GENERATE STRUCTURED DATA TABLE (for the User)
    # Convert extracted JSON into a clean, readable table format for the LLM to present.
    data_table = {}
    if extracted:
        # Mapping internal keys to human-readable labels
        mapping = {
            "uuid": "UUID/Folio Fiscal",
            "issuer_name": "Issuer (Emisor)",
            "receiver_name": "Receiver (Receptor)",
            "total": "Total Amount",
            "currency": "Currency",
            "date": "Date",
            "receptor_rfc": "Receiver RFC"
        }
        for k, v in extracted.items():
            label = mapping.get(k, k)
            data_table[label] = v

    summary = f"Validation: {passed} passed, {warnings} warnings, {failed} failed. " \
              f"Pairing: {'✅ Paired' if paired else '❌ Unpaired'}. " \
              f"Status: {'✅ FULLY VERIFIED' if is_fully_verified else '⚠️ ACTION REQUIRED'}"
    
    return ToolResult(
        ok=True,
        summary=summary,
        data={
            "is_fully_verified": is_fully_verified,
            "extracted_data_table": data_table,
            "validation_results": [
                {
                    "rule_code": r.rule_code,
                    "status": r.status,
                    "message": r.message,
                }
                for r in results
            ],
            "pairing": {
                "document_type": document.document_type,
                "paired": paired,
                "partner_id": pair.get('pdf_document_id') if paired and isinstance(pair, dict) else (pair.id if paired else None),
            },
        },
    )

# ---------------------------------------------------------------------------
# Register the tool with the global registry.
# ---------------------------------------------------------------------------
REGISTRY.register(
    ToolSpec(
        name="expense_validation",
        description="Validate a CFDI XML or PDF, run SAT SOAP, check policies, and ensure a matching counterpart document exists.",
        category="write",
        input_schema=_ValidateArgs,
        handler=_expense_validation,
        personas=frozenset({"accounting", "admin"}),
    )
)
