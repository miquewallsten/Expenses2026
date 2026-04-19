from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.core.platform.schemas import CompanyCreate, CompanyRead, CompanyUpdate
from packages.core.platform.service import (
    create_company,
    delete_company,
    get_company,
    list_companies,
    update_company,
)

router = APIRouter(prefix="/companies", tags=["companies"])


@router.post("/", response_model=CompanyRead)
def create_company_route(payload: CompanyCreate, db: Session = Depends(get_db)):
    try:
        return create_company(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=list[CompanyRead])
def list_companies_route(db: Session = Depends(get_db)):
    return list_companies(db)


@router.get("/{company_id}", response_model=CompanyRead)
def get_company_route(company_id: int, db: Session = Depends(get_db)):
    company = get_company(db, company_id)

    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    return company


@router.patch("/{company_id}", response_model=CompanyRead)
def update_company_route(
    company_id: int,
    payload: CompanyUpdate,
    db: Session = Depends(get_db),
):
    try:
        company = update_company(db, company_id, payload)

        if not company:
            raise HTTPException(status_code=404, detail="Company not found")

        return company
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{company_id}")
def delete_company_route(company_id: int, db: Session = Depends(get_db)):
    deleted = delete_company(db, company_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Company not found")

    return {"status": "deleted"}