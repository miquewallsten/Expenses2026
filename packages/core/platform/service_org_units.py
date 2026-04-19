from typing import List, Optional

from sqlalchemy.orm import Session

from packages.core.platform.models_project import Project
from packages.core.platform.models_client import Client
from packages.core.platform.models_cost_center import CostCenter
from packages.core.platform.schemas_org_units import (
    ClientCreate,
    CostCenterCreate,
    ProjectCreate,
)


# ── Project ───────────────────────────────────────────────────────────────────

def create_project(db: Session, data: ProjectCreate) -> Project:
    project = Project(
        company_id=data.company_id,
        name=data.name,
        code=data.code,
        status=data.status if data.status is not None else "active",
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def list_projects(db: Session, company_id: Optional[int] = None) -> List[Project]:
    query = db.query(Project)
    if company_id is not None:
        query = query.filter(Project.company_id == company_id)
    return query.all()


# ── Client ────────────────────────────────────────────────────────────────────

def create_client(db: Session, data: ClientCreate) -> Client:
    client = Client(
        company_id=data.company_id,
        name=data.name,
        code=data.code,
        status=data.status if data.status is not None else "active",
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


def list_clients(db: Session, company_id: Optional[int] = None) -> List[Client]:
    query = db.query(Client)
    if company_id is not None:
        query = query.filter(Client.company_id == company_id)
    return query.all()


# ── CostCenter ────────────────────────────────────────────────────────────────

def create_cost_center(db: Session, data: CostCenterCreate) -> CostCenter:
    cost_center = CostCenter(
        company_id=data.company_id,
        name=data.name,
        code=data.code,
        status=data.status if data.status is not None else "active",
    )
    db.add(cost_center)
    db.commit()
    db.refresh(cost_center)
    return cost_center


def list_cost_centers(db: Session, company_id: Optional[int] = None) -> List[CostCenter]:
    query = db.query(CostCenter)
    if company_id is not None:
        query = query.filter(CostCenter.company_id == company_id)
    return query.all()
