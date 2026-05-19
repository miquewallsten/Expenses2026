"""
Admin Dimensions router — unified CRUD + Excel/CSV import for the three
organisational dimensions used across Expenses: Project, Client, Cost Center.

Kinds (path param):
  - "projects"
  - "clients"
  - "cost-centers"
"""
from __future__ import annotations

import io
import re
from typing import Literal

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from apps.api.auth import get_current_user, require_permission, require_same_company
from packages.core.platform.models_user import User
from apps.api.deps import get_db
from packages.core.platform.models_client import Client
from packages.core.platform.models_cost_center import CostCenter
from packages.core.platform.models_project import Project
from packages.modules.admin.schemas.dimensions import (
    CostCenterCreate, CostCenterUpdate, CostCenterRead,
    ProjectCreate, ProjectUpdate, ProjectRead,
    ClientCreate, ClientUpdate, ClientRead,
    DimensionBudgetSummary,
)

router = APIRouter(prefix="/admin/dimensions", tags=["admin"], dependencies=[Depends(require_permission("accounting:configure"))])

Kind = Literal["projects", "clients", "cost-centers"]
_MODEL = {"projects": Project, "clients": Client, "cost-centers": CostCenter}


def _resolve(kind: str):
    if kind not in _MODEL:
        raise HTTPException(400, f"unknown kind: {kind}")
    return _MODEL[kind]


# ── Import schemas (kept for backward compat) ──────────────────────────────

class DimensionUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    status: str | None = None


class ImportPreviewRow(BaseModel):
    row: int
    name: str | None
    code: str | None
    duplicate: bool


class ImportPreview(BaseModel):
    headers: list[str]
    suggested_map: dict[str, str | None]
    total_rows: int
    rows: list[ImportPreviewRow]
    detected_count: int


class ImportCommitPayload(BaseModel):
    company_id: int
    rows: list[dict]


class ImportCommitResult(BaseModel):
    inserted: int
    skipped_duplicates: int
    errors: list[str]


# ── List (full read) ───────────────────────────────────────────────────────

@router.get("/{kind}/{company_id}")
def list_dimensions(kind: Kind, company_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_same_company(company_id, current_user)
    model = _resolve(kind)
    return db.query(model).filter(model.company_id == company_id).order_by(model.code).all()


# ── Create ──────────────────────────────────────────────────────────────────

@router.post("/{kind}", status_code=201)
def create_dimension(kind: Kind, body: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    model = _resolve(kind)
    company_id = body.get("company_id")
    if not company_id:
        raise HTTPException(400, "company_id required")
    require_same_company(company_id, current_user)

    # Check duplicate code
    code = (body.get("code") or "").strip()
    existing = db.query(model).filter(model.company_id == company_id, model.code == code).first()
    if existing:
        raise HTTPException(409, f"{kind} with code '{code}' already exists")

    obj = model(**body)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


# ── Read single ────────────────────────────────────────────────────────────

@router.get("/{kind}/item/{item_id}")
def get_dimension(kind: Kind, item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    model = _resolve(kind)
    obj = db.get(model, item_id)
    if not obj or obj.company_id != current_user.company_id:
        raise HTTPException(404, "not found")
    return obj


# ── Patch (backward compat) ────────────────────────────────────────────────

@router.patch("/{kind}/{item_id}")
def patch_dimension(kind: Kind, item_id: int, payload: DimensionUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    model = _resolve(kind)
    obj = db.get(model, item_id)
    if not obj or obj.company_id != current_user.company_id:
        raise HTTPException(404, "not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


# ── Full update (enriched fields) ──────────────────────────────────────────

@router.put("/{kind}/{item_id}")
def update_dimension(kind: Kind, item_id: int, body: dict, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    model = _resolve(kind)
    obj = db.get(model, item_id)
    if not obj or obj.company_id != current_user.company_id:
        raise HTTPException(404, "not found")

    # Only update fields that exist on the model
    allowed = {c.name for c in model.__table__.columns}
    for k, v in body.items():
        if k in allowed and k not in ("id", "company_id", "created_at"):
            setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


# ── Delete ──────────────────────────────────────────────────────────────────

@router.delete("/{kind}/{item_id}", status_code=204)
def delete_dimension(kind: Kind, item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    model = _resolve(kind)
    obj = db.get(model, item_id)
    if not obj or obj.company_id != current_user.company_id:
        raise HTTPException(404, "not found")
    db.delete(obj)
    db.commit()


# ── Budget vs Actual ──────────────────────────────────────────────────────

@router.get("/{kind}/{company_id}/budget")
def dimension_budget(kind: Kind, company_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return budget vs. actual spend for each dimension item."""
    require_same_company(company_id, current_user)
    from packages.modules.expenses.models.expense import Expense
    from packages.modules.expenses.models.expense_allocation import ExpenseAllocation

    model = _resolve(kind)
    items = db.query(model).filter(model.company_id == company_id, model.status == "active").all()

    # Determine the FK column on ExpenseAllocation
    fk_col = {"projects": ExpenseAllocation.project_id, "clients": ExpenseAllocation.client_id, "cost-centers": ExpenseAllocation.cost_center_id}[kind]

    # Sum actual spend per dimension item
    spend_rows = (
        db.query(fk_col, func.sum(Expense.amount))
        .join(Expense, Expense.id == ExpenseAllocation.expense_id)
        .filter(Expense.company_id == company_id, Expense.status.in_(["submitted", "manager_approved", "approved"]))
        .group_by(fk_col)
        .all()
    )
    spend_map = {row[0]: float(row[1] or 0) for row in spend_rows}

    results = []
    for item in items:
        budget = getattr(item, "budget_amount", None)
        spent = spend_map.get(item.id, 0.0)
        remaining = (budget - spent) if budget is not None else None
        pct = (spent / budget * 100) if budget and budget > 0 else None
        results.append(DimensionBudgetSummary(
            id=item.id, code=item.code, name=item.name,
            budget_amount=budget, spent_amount=spent,
            remaining=remaining, percent_used=pct,
        ))
    return results


# ── Import — column heuristics ───────────────────────────────────────────────

_NAME_PATTERNS = [
    r"^nombre$", r"^name$", r"^proyecto$", r"^project$", r"^cliente$", r"^client$",
    r"^customer$", r"^centro\s*de\s*costo$", r"^cost\s*center$", r"^departamento$",
    r"^description$", r"^descripci.n$", r"^razon\s*social$",
]
_CODE_PATTERNS = [
    r"^c[oó]digo$", r"^code$", r"^clave$", r"^id$", r"^sku$", r"^ref(erencia)?$",
    r"^n[uú]m(ero)?$", r"^no\.?$", r"^rfc$", r"^account$",
]


def _match(header: str, patterns: list[str]) -> bool:
    h = header.strip().lower()
    return any(re.search(p, h) for p in patterns)


def _suggest_columns(headers: list[str]) -> dict[str, str | None]:
    name_col = next((h for h in headers if _match(h, _NAME_PATTERNS)), None)
    code_col = next((h for h in headers if _match(h, _CODE_PATTERNS)), None)
    if not code_col and headers:
        code_col = headers[0]
    if not name_col and len(headers) >= 2:
        name_col = headers[1]
    if not name_col and headers:
        name_col = headers[0]
    return {"name": name_col, "code": code_col}


# ── Import — preview ─────────────────────────────────────────────────────────

@router.post("/{kind}/import/preview", response_model=ImportPreview)
async def import_preview(
    kind: Kind,
    company_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(company_id, current_user)
    model = _resolve(kind)
    filename = (file.filename or "").lower()
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "empty file")

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(raw), dtype=str, keep_default_na=False)
        elif filename.endswith((".xlsx", ".xls", ".xlsm")):
            df = pd.read_excel(io.BytesIO(raw), dtype=str)
        else:
            try:
                df = pd.read_excel(io.BytesIO(raw), dtype=str)
            except Exception:
                df = pd.read_csv(io.BytesIO(raw), dtype=str, keep_default_na=False)
    except Exception as exc:
        raise HTTPException(400, f"cannot parse file: {exc}")

    df = df.fillna("")
    headers = [str(h).strip() for h in df.columns.tolist()]
    suggested = _suggest_columns(headers)

    existing_codes = {
        c for (c,) in db.query(model.code).filter(model.company_id == company_id).all()
    }

    name_col, code_col = suggested["name"], suggested["code"]
    preview: list[ImportPreviewRow] = []
    detected = 0
    for i, row in df.head(50).iterrows():
        nm = str(row.get(name_col, "")).strip() if name_col else ""
        cd = str(row.get(code_col, "")).strip() if code_col else ""
        if nm and cd:
            detected += 1
        preview.append(ImportPreviewRow(
            row=int(i) + 2,
            name=nm or None,
            code=cd or None,
            duplicate=cd in existing_codes if cd else False,
        ))

    return ImportPreview(
        headers=headers,
        suggested_map=suggested,
        total_rows=int(len(df)),
        rows=preview,
        detected_count=detected,
    )


# ── Import — commit ──────────────────────────────────────────────────────────

@router.post("/{kind}/import/commit", response_model=ImportCommitResult)
def import_commit(kind: Kind, payload: ImportCommitPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_same_company(payload.company_id, current_user)
    model = _resolve(kind)
    existing_codes = {
        c for (c,) in db.query(model.code).filter(model.company_id == payload.company_id).all()
    }

    inserted = 0
    skipped = 0
    errors: list[str] = []
    seen_in_batch: set[str] = set()

    for i, r in enumerate(payload.rows):
        name = (r.get("name") or "").strip()
        code = (r.get("code") or "").strip()
        if not name or not code:
            errors.append(f"row {i + 1}: name and code required")
            continue
        if code in existing_codes or code in seen_in_batch:
            skipped += 1
            continue
        seen_in_batch.add(code)
        db.add(model(company_id=payload.company_id, name=name[:255], code=code[:100], status="active"))
        inserted += 1

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(400, f"import failed: {exc}") from exc

    return ImportCommitResult(inserted=inserted, skipped_duplicates=skipped, errors=errors)
