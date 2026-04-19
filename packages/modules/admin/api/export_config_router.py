from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.core.platform.models_export_config import ExportConfig

router = APIRouter(prefix="/admin/export-config", tags=["admin"])


class ExportConfigUpdate(BaseModel):
    file_pattern: str
    folder_pattern: str


class ExportConfigRead(BaseModel):
    company_id: int
    file_pattern: str
    folder_pattern: str
    export_format: str
    date_format: str | None = None


@router.put("/{company_id}", response_model=ExportConfigRead)
def upsert_export_config(
    company_id: int,
    data: ExportConfigUpdate,
    db: Session = Depends(get_db),
):
    row = db.query(ExportConfig).filter(ExportConfig.company_id == company_id).first()
    if row is None:
        row = ExportConfig(company_id=company_id)
        db.add(row)
    row.file_pattern = data.file_pattern
    row.folder_pattern = data.folder_pattern
    db.commit()
    db.refresh(row)
    return row
