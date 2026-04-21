from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


VALID_BACKENDS = ("local", "nas", "s3", "azure")


class StorageConfigRead(BaseModel):
    id: int
    company_id: int
    backend: str
    local_path: str | None
    endpoint_url: str | None
    bucket: str | None
    prefix: str | None
    region: str | None
    azure_account: str | None
    azure_container: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class StorageConfigUpdate(BaseModel):
    backend: str | None = None
    local_path: str | None = None
    endpoint_url: str | None = None
    bucket: str | None = None
    prefix: str | None = None
    region: str | None = None
    azure_account: str | None = None
    azure_container: str | None = None
