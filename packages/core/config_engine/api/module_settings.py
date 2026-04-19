from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.core.config_engine.schemas_module_setting import ModuleSettingCreate, ModuleSettingRead
from packages.core.config_engine.service_module_setting import list_module_settings, upsert_module_setting

router = APIRouter(prefix="/module-settings", tags=["module-settings"])


@router.post("/", response_model=ModuleSettingRead)
def upsert_module_setting_route(
    payload: ModuleSettingCreate,
    db: Session = Depends(get_db),
):
    return upsert_module_setting(db, payload)


@router.get("/{company_id}/{module_key}", response_model=list[ModuleSettingRead])
def list_module_settings_route(
    company_id: int,
    module_key: str,
    db: Session = Depends(get_db),
):
    return list_module_settings(db, company_id, module_key)
