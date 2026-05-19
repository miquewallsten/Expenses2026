from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.service.cfdi_pairing_service import (
    find_best_xml_match_for_pdf,
)
from packages.modules.expenses.service.document_matching_service import (
    find_best_pdf_match_for_xml,
)

router = APIRouter(prefix="/expenses/cfdi-pairing", tags=["cfdi-pairing"], dependencies=[Depends(get_current_user)])


@router.get("/pdf/{document_id}")
def get_best_xml_for_pdf(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Find the best-matching CFDI XML document for a given PDF.

    Uses SAT CFDI QR identity (UUID-level certainty) extracted from the PDF's
    content_text as the primary matching signal.

    Returns a match result when a pairing candidate is found, or a safe
    ``matched=False`` response when no CFDI QR is present in the PDF or no
    XML counterpart exists in the company.

    Response shape (matched)::

        {
            "matched": true,
            "pdf_document_id": 42,
            "xml_document_id": 17,
            "confidence": "high",
            "match_reason": "UUID exact match (...)",
            "pdf_qr_identity": { ... }
        }

    Response shape (not matched)::

        {
            "matched": false,
            "pdf_document_id": 42,
            "xml_document_id": null,
            "confidence": null,
            "match_reason": "No CFDI QR identity found in PDF",
            "pdf_qr_identity": null
        }
    """
    doc = db.query(ExpenseDocument).filter(ExpenseDocument.id == document_id).first()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    if not doc.filename.lower().endswith(".pdf"):
        return {
            "pairing_applicable": False,
            "document_id":        document_id,
            "document_type":      doc.document_type,
            "match":              None,
            "reason":             "Document is not a PDF",
        }

    company_id = doc.company_id

    result = find_best_xml_match_for_pdf(
        db=db,
        company_id=company_id,
        pdf_document_id=document_id,
    )

    if result is None:
        return {
            "matched":         False,
            "pdf_document_id": document_id,
            "xml_document_id": None,
            "confidence":      None,
            "match_reason":    "No CFDI QR identity found in PDF or no XML counterpart exists",
            "pdf_qr_identity": None,
        }

    return {
        "matched":         True,
        "pdf_document_id": result["pdf_document_id"],
        "xml_document_id": result["xml_document_id"],
        "confidence":      result["confidence"],
        "match_reason":    result["match_reason"],
        "pdf_qr_identity": result.get("pdf_qr_identity"),
    }


@router.get("/xml/{document_id}")
def get_best_pdf_for_xml(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Find the best-matching PDF document for a given CFDI XML.

    Uses filename stem, document date, RFC fields, total amount, and UUID
    from the XML identity to score all PDF candidates in the company.

    Returns a match result when a candidate reaches the *possible* threshold
    (score ≥ 20), or a safe ``matched=False`` response when no candidate
    qualifies.

    Response shape (matched)::

        {
            "matched": true,
            "xml_document_id": 17,
            "pdf_document_id": 42,
            "score": 80,
            "match_level": "strong",
            "reasons": [ ... ]
        }

    Response shape (not matched)::

        {
            "matched": false,
            "xml_document_id": 17,
            "pdf_document_id": null,
            "score": null,
            "match_level": null,
            "reasons": []
        }
    """
    doc = db.query(ExpenseDocument).filter(ExpenseDocument.id == document_id).first()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.document_type != "cfdi_xml":
        return {
            "pairing_applicable": False,
            "document_id":        document_id,
            "document_type":      doc.document_type,
            "match":              None,
            "reason":             "Document is not an XML",
        }

    company_id = doc.company_id

    result = find_best_pdf_match_for_xml(
        db=db,
        company_id=company_id,
        xml_document_id=document_id,
    )

    if result is None:
        return {
            "matched":         False,
            "xml_document_id": document_id,
            "pdf_document_id": None,
            "score":           None,
            "match_level":     None,
            "reasons":         [],
        }

    return {
        "matched":         True,
        "xml_document_id": result["xml_document_id"],
        "pdf_document_id": result["pdf_document_id"],
        "score":           result["score"],
        "match_level":     result["match_level"],
        "reasons":         result.get("reasons", []),
    }
