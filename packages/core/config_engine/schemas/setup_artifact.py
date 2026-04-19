from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SetupArtifactCreate(BaseModel):
    setup_session_id: int
    artifact_type: str
    filename: str
    content_text: str


class SetupArtifactRead(BaseModel):
    id: int
    setup_session_id: int
    artifact_type: str
    filename: str
    content_text: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
