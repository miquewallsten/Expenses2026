from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.service.document_triage_service import (
    triage_uploaded_document,
)

router = APIRouter(prefix="/expenses/document-triage", tags=["document-triage"])


@router.get("/{document_id}")
def get_document_triage(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    doc = db.query(ExpenseDocument).filter(ExpenseDocument.id == document_id).first()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    result = triage_uploaded_document(db=db, company_id=doc.company_id, document_id=document_id)
    if result.get("reasons") == ["Document not found"]:
        raise HTTPException(status_code=404, detail="Document not found")
    return result
