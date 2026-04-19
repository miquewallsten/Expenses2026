from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.modules.admin.schemas.company_setup import (
    CompanySetupRead,
    CompanySetupUpdate,
)
from packages.modules.admin.schemas.legal_entity import (
    LegalEntityCreate,
    LegalEntityRead,
    LegalEntityUpdate,
)
from packages.modules.admin.service.company_setup_service import (
    create_legal_entity,
    delete_legal_entity,
    get_or_create_company_setup,
    list_legal_entities,
    update_legal_entity,
    upsert_company_setup,
)


class DeleteResponse(BaseModel):
    success: bool


router = APIRouter(prefix="/admin/company-setup", tags=["admin"])


@router.get("/{company_id}", response_model=CompanySetupRead)
def get_company_setup_route(company_id: int, db: Session = Depends(get_db)):
    return get_or_create_company_setup(db, company_id)


@router.put("/{company_id}", response_model=CompanySetupRead)
def upsert_company_setup_route(
    company_id: int,
    data: CompanySetupUpdate,
    db: Session = Depends(get_db),
):
    return upsert_company_setup(db, company_id, data)


@router.get("/{company_id}/legal-entities", response_model=list[LegalEntityRead])
def list_legal_entities_route(company_id: int, db: Session = Depends(get_db)):
    return list_legal_entities(db, company_id)


@router.post("/{company_id}/legal-entities", response_model=LegalEntityRead, status_code=201)
def create_legal_entity_route(
    company_id: int,
    data: LegalEntityCreate,
    db: Session = Depends(get_db),
):
    if data.company_id != company_id:
        raise HTTPException(status_code=400, detail="company_id in body does not match URL")
    return create_legal_entity(db, data)


@router.put("/legal-entities/{entity_id}", response_model=LegalEntityRead)
def update_legal_entity_route(
    entity_id: int,
    data: LegalEntityUpdate,
    db: Session = Depends(get_db),
):
    entity = update_legal_entity(db, entity_id, data)
    if not entity:
        raise HTTPException(status_code=404, detail="Legal entity not found")
    return entity


@router.delete("/legal-entities/{entity_id}", response_model=DeleteResponse)
def delete_legal_entity_route(entity_id: int, db: Session = Depends(get_db)):
    deleted = delete_legal_entity(db, entity_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Legal entity not found")
    return DeleteResponse(success=True)
