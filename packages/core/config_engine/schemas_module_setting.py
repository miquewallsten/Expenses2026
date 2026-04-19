from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ModuleSettingCreate(BaseModel):
    company_id: int
    module_key: str
    setting_key: str
    setting_value: str


class ModuleSettingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    module_key: str
    setting_key: str
    setting_value: str
    created_at: datetime
