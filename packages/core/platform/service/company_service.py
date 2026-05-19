from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_channels import CompanyChannelConfig
from packages.core.platform.models_auth_settings import CompanyAuthSettings
from packages.core.platform.schemas import CompanyCreate, CompanyUpdate


def create_company(db: Session, payload: CompanyCreate) -> Company:
    existing = db.query(Company).filter(Company.slug == payload.slug).first()

    if existing:
        raise ValueError("Company with this slug already exists")

    company = Company(name=payload.name, slug=payload.slug)
    db.add(company)
    db.flush() # Get company.id

    # Create associated settings rows
    db.add(CompanyChannelConfig(company_id=company.id))
    db.add(CompanyAuthSettings(company_id=company.id))

    db.commit()
    db.refresh(company)
    return company


def list_companies(db: Session) -> list[Company]:
    return db.query(Company).all()


def get_company(db: Session, company_id: int) -> Company | None:
    return db.query(Company).filter(Company.id == company_id).first()


def update_company(db: Session, company_id: int, payload: CompanyUpdate) -> Company | None:
    company = db.query(Company).filter(Company.id == company_id).first()

    if not company:
        return None

    if payload.name is not None:
        company.name = payload.name

    if payload.slug is not None:
        existing = db.query(Company).filter(Company.slug == payload.slug, Company.id != company_id).first()
        if existing:
            raise ValueError("Company with this slug already exists")
        company.slug = payload.slug

    db.commit()
    db.refresh(company)
    return company


def delete_company(db: Session, company_id: int) -> bool:
    company = db.query(Company).filter(Company.id == company_id).first()

    if not company:
        return False

    db.delete(company)
    db.commit()
    return True