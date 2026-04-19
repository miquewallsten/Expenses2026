from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PolizaRead(BaseModel):
    id: int
    report_id: int
    company_id: int
    status: str
    content_text: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
