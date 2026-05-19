"""Archive — document vault, search, and retrieval.

Provides endpoints for listing, searching, and retrieving archived documents
for a company. Gated on the archive module being enabled.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_same_company
from apps.api.deps import get_db
from packages.core.platform.module_gate import require_module
from packages.core.platform.models_user import User
from packages.modules.expenses.models.document import ExpenseDocument

router = APIRouter(
    prefix="/archive",
    tags=["archive"],
    dependencies=[Depends(require_module("archive"))],
)


@router.get("/{company_id}/files")
def list_archive_files(
    company_id: int,
    search: str | None = None,
    document_type: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """List and search archived documents for a company."""
    require_same_company(company_id, current_user)

    query = db.query(ExpenseDocument).filter(
        ExpenseDocument.company_id == company_id,
    )

    if search:
        query = query.filter(
            ExpenseDocument.filename.ilike(f"%{search}%")
        )

    if document_type and document_type != "all":
        query = query.filter(ExpenseDocument.document_type == document_type)

    total = query.count()
    items = (
        query.order_by(ExpenseDocument.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "items": [
            {
                "id": d.id,
                "filename": d.filename,
                "document_type": d.document_type,
                "content_type": d.content_type,
                "size_bytes": len(d.content_text) if d.content_text else None,
                "expense_id": d.expense_id,
                "company_id": d.company_id,
                "created_at": d.created_at.isoformat() if d.created_at else None,
                "tags": [],
                "description": None,
            }
            for d in items
        ],
        "total": total,
    }
