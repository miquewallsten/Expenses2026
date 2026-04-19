from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ArchiveConfigUpdate(BaseModel):
    file_pattern:   str | None = None
    folder_pattern: str | None = None


class ArchiveConfigRead(BaseModel):
    id:             int
    company_id:     int
    file_pattern:   str
    folder_pattern: str
    created_at:     datetime
    updated_at:     datetime

    model_config = ConfigDict(from_attributes=True)
