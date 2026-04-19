from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ExportConfigRead(BaseModel):
    id: int
    company_id: int
    bundle_name_pattern: str
    export_format: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExportConfigUpdate(BaseModel):
    bundle_name_pattern: str | None = None
    export_format: str | None = None
