from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from apps.api.auth import require_admin
from packages.core.platform.models_storage_config import StorageConfig
from packages.modules.admin.schemas.storage_config import StorageConfigRead, StorageConfigUpdate, VALID_BACKENDS

router = APIRouter(
    prefix="/admin/storage-config",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)

_DEFAULT_BACKEND = "local"
_DEFAULT_LOCAL_PATH = "./storage"


def _get_or_create(company_id: int, db: Session) -> StorageConfig:
    cfg = db.query(StorageConfig).filter(StorageConfig.company_id == company_id).first()
    if cfg is None:
        cfg = StorageConfig(
            company_id=company_id,
            backend=_DEFAULT_BACKEND,
            local_path=_DEFAULT_LOCAL_PATH,
        )
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


@router.get("/{company_id}", response_model=StorageConfigRead)
def get_storage_config(company_id: int, db: Session = Depends(get_db)):
    """Return storage config for *company_id*, creating defaults if none exist."""
    return _get_or_create(company_id, db)


@router.put("/{company_id}", response_model=StorageConfigRead)
def update_storage_config(
    company_id: int,
    payload: StorageConfigUpdate,
    db: Session = Depends(get_db),
):
    """Update storage backend config for *company_id*."""
    if payload.backend is not None and payload.backend not in VALID_BACKENDS:
        raise HTTPException(
            status_code=422,
            detail=f"backend must be one of: {', '.join(VALID_BACKENDS)}",
        )

    cfg = _get_or_create(company_id, db)

    for field in ("backend", "local_path", "endpoint_url", "bucket", "prefix", "region", "azure_account", "azure_container"):
        val = getattr(payload, field)
        if val is not None:
            setattr(cfg, field, val)

    db.commit()
    db.refresh(cfg)
    return cfg
