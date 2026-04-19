from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SetupInferenceRead(BaseModel):
    id: int
    setup_session_id: int
    inference_type: str
    result_text: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
