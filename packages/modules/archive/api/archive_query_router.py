from fastapi import APIRouter, Depends, Depends
from sqlalchemy.orm import Session

from apps.api.auth import require_admin, require_same_company, get_current_user
from apps.api.deps import get_db
from packages.core.platform.models_archive_file import ArchiveFile
from packages.modules.archive.schemas.archive_file import ArchiveFileListResponse

router = APIRouter(prefix="/archive/query", dependencies=[Depends(require_admin)], tags=["archive-query"])


@router.get("/expense/{expense_id}", response_model=ArchiveFileListResponse)
def list_archive_by_expense(expense_id: int, db: Session = Depends(get_db)):
    """Return all archived file metadata records linked to *expense_id*.

    Metadata only — no file bytes are returned or loaded.
    """
    items = (
        db.query(ArchiveFile)
        .filter(ArchiveFile.expense_id == expense_id)
        .order_by(ArchiveFile.created_at.desc())
        .all()
    )
    return ArchiveFileListResponse(expense_id=expense_id, items=items)
