from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.auth import require_admin, require_same_company, get_current_user
from packages.core.platform.module_gate import require_module
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.models_archive_config import ArchiveConfig
from packages.modules.archive.schemas.archive_config import ArchiveConfigRead, ArchiveConfigUpdate

router = APIRouter(prefix="/admin/archive-config", dependencies=[Depends(require_admin), Depends(require_module("archive"))], tags=["archive-config"])

_DEFAULT_FILE_PATTERN   = "{company}_{date}_{expense_id}"
_DEFAULT_FOLDER_PATTERN = "{year}/{month}"


def _get_or_create(company_id: int, db: Session) -> ArchiveConfig:
    """Return the existing ``ArchiveConfig`` row for *company_id*, or create one
    with default naming patterns and persist it immediately."""
    cfg = db.query(ArchiveConfig).filter(ArchiveConfig.company_id == company_id).first()
    if cfg is None:
        cfg = ArchiveConfig(
            company_id=company_id,
            file_pattern=_DEFAULT_FILE_PATTERN,
            folder_pattern=_DEFAULT_FOLDER_PATTERN,
        )
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


# ── Routes ─────────────────────────────────────────────────────────────────────


@router.get("/{company_id}", response_model=ArchiveConfigRead)
def get_archive_config(company_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not getattr(current_user, "is_super_admin", False):
        require_same_company(company_id, current_user)
    """Return archive config for *company_id*, creating a default row if none exists."""
    return _get_or_create(company_id, db)


@router.put("/{company_id}", response_model=ArchiveConfigRead)
def upsert_archive_config(
    company_id: int,
    payload: ArchiveConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not getattr(current_user, "is_super_admin", False):
        require_same_company(company_id, current_user)
    """Update archive naming config for *company_id*.

    Creates a default row if none exists, then applies only the fields
    present in *payload* (partial update).
    """
    cfg = _get_or_create(company_id, db)

    if payload.file_pattern is not None:
        cfg.file_pattern = payload.file_pattern
    if payload.folder_pattern is not None:
        cfg.folder_pattern = payload.folder_pattern

    db.commit()
    db.refresh(cfg)
    return cfg
