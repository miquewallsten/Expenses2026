from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ValidationResultRead(BaseModel):
    id: int
    document_id: int
    source: str
    rule_code: str
    status: str
    message: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
