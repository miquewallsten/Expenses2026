from sqlalchemy.orm import Session

from packages.core.platform.models_archive_file import ArchiveFile
from packages.modules.archive.service.archive_service import store_file


def archive_uploaded_expense_file(
    db: Session,
    company_id: int,
    expense_id: int,
    file_bytes: bytes,
    original_filename: str,
    source_type: str = "upload",
) -> ArchiveFile:
    """Archive a file that belongs to a specific expense.

    Delegates to ``store_file`` and returns the committed ``ArchiveFile`` row.
    """
    return store_file(
        db=db,
        company_id=company_id,
        original_filename=original_filename,
        file_bytes=file_bytes,
        expense_id=expense_id,
        source_type=source_type,
    )
