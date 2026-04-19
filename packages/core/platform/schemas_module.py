from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class PlatformModuleCreate(BaseModel):
    key: str
    name: str
    description: str
    is_core: bool = False


class PlatformModuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    name: str
    description: str
    is_core: bool
    created_at: datetime


class CompanyModuleCreate(BaseModel):
    company_id: int
    module_key: str
    enabled: bool = True
    config_json: Optional[str] = None


class CompanyModuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    module_key: str
    enabled: bool
    config_json: Optional[str]
    created_at: datetime
