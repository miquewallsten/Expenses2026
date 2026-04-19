from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.core.platform.schemas_module import (
    CompanyModuleCreate,
    CompanyModuleRead,
    PlatformModuleCreate,
    PlatformModuleRead,
)
from packages.core.platform.service_module import (
    create_platform_module,
    enable_company_module,
    list_company_modules,
    list_enabled_module_keys_for_company,
    list_platform_modules,
)


class VisibleModulesResponse(BaseModel):
    company_id: int
    enabled_module_keys: list[str]

router = APIRouter(prefix="/modules", tags=["modules"])


@router.post("/registry", response_model=PlatformModuleRead)
def register_module(payload: PlatformModuleCreate, db: Session = Depends(get_db)):
    try:
        return create_platform_module(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/registry", response_model=list[PlatformModuleRead])
def get_registry(db: Session = Depends(get_db)):
    return list_platform_modules(db)


@router.post("/company", response_model=CompanyModuleRead)
def upsert_company_module(payload: CompanyModuleCreate, db: Session = Depends(get_db)):
    return enable_company_module(db, payload)


@router.get("/company/{company_id}", response_model=list[CompanyModuleRead])
def get_company_modules(company_id: int, db: Session = Depends(get_db)):
    return list_company_modules(db, company_id)


@router.get("/visible/{company_id}", response_model=VisibleModulesResponse)
def get_visible_modules(
    company_id: int,
    user_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
):
    keys = list_enabled_module_keys_for_company(db, company_id)
    return VisibleModulesResponse(company_id=company_id, enabled_module_keys=keys)
