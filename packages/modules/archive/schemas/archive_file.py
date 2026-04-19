from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ArchiveFileRead(BaseModel):
    id:              int
    company_id:      int
    expense_id:      int | None
    file_name:       str
    file_type:       str
    source_type:     str
    storage_backend: str
    storage_key:     str
    content_text:      str | None = None
    document_type:     str | None = None
    validation_summary: str | None = None
    created_at:      datetime

    model_config = ConfigDict(from_attributes=True)


class ArchiveFileListResponse(BaseModel):
    expense_id: int
    items:      list[ArchiveFileRead]
