from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserCreate(BaseModel):
    company_id: int
    email: str
    full_name: str
    role: str | None = None


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    email: str
    full_name: str
    role: str
    created_at: datetime
