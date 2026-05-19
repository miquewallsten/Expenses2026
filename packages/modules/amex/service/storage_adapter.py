"""Storage adapter for Amex — decouples from Archive module.

When the Archive add-on is installed, files go through the full archive
pipeline (metadata + storage backend). When Archive is disabled, we fall
back to simple file storage that stores directly without archive metadata.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from packages.core.platform.models_company_setup import CompanySetup


def _is_archive_enabled(db: Session, company_id: int) -> bool:
    """Check if the Archive module is enabled for this company."""
    setup = db.query(CompanySetup).filter(CompanySetup.company_id == company_id).first()
    return bool(getattr(setup, "archive_module_enabled", False)) if setup else False


def store_file_for_amex(
    db: Session,
    company_id: int,
    original_filename: str,
    file_bytes: bytes,
    source_type: str = "amex",
    **kwargs,
):
    """Store a file, using Archive if available, otherwise simple storage.
    
    This makes the Amex module work independently of Archive.
    When Archive is installed, files get full archiving (metadata, search, retention).
    When Archive is not installed, files are stored via the storage backend directly.
    """
    if _is_archive_enabled(db, company_id):
        # Use the full archive pipeline
        from packages.modules.archive.service.archive_service import store_file
        return store_file(
            db, company_id, original_filename, file_bytes,
            source_type=source_type, **kwargs,
        )
    else:
        # Fallback: store directly via storage backend without archive metadata
        from packages.core.platform.models_storage_config import StorageConfig
        from packages.modules.archive.service.storage_backend import get_storage_backend
        import uuid
        
        storage = get_storage_backend(db, company_id)
        ext = original_filename.rsplit(".", 1)[-1] if "." in original_filename else "bin"
        storage_key = f"amex/{company_id}/{uuid.uuid4().hex}.{ext}"
        
        if hasattr(storage, 'upload'):
            result_key = storage.upload(storage_key, file_bytes, content_type=f"application/{ext}")
            return type('SimpleFile', (), {
                'storage_key': result_key or storage_key,
                'original_filename': original_filename,
                'file_size': len(file_bytes),
            })()
        else:
            return type('SimpleFile', (), {
                'storage_key': storage_key,
                'original_filename': original_filename,
                'file_size': len(file_bytes),
            })()
