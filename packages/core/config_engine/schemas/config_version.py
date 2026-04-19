from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ConfigVersionRead(BaseModel):
    id: int
    setup_session_id: int
    config_type: str
    content_text: str
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
