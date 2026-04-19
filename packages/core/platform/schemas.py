from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CompanyCreate(BaseModel):
    name: str
    slug: str


class CompanyUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None


class CompanyRead(BaseModel):
    id: int
    name: str
    slug: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)