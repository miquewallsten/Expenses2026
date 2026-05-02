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

from apps.api.auth import get_current_user, require_admin, require_same_company
from packages.core.platform.models_user import User
from apps.api.deps import get_db
from packages.core.platform.models_client import Client
from packages.core.platform.models_cost_center import CostCenter
from packages.core.platform.models_project import Project

router = APIRouter(prefix="/admin/dimensions", tags=["admin"], dependencies=[Depends(require_admin)])

Kind = Literal["projects", "clients", "cost-centers"]
_MODEL = {"projects": Project, "clients": Client, "cost-centers": CostCenter}


def _resolve(kind: str):
    if kind not in _MODEL:
        raise HTTPException(400, f"unknown kind: {kind}")
    return _MODEL[kind]


# ── Schemas ──────────────────────────────────────────────────────────────────

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
    suggested_map: dict[str, str | None]  # {"name": "Nombre", "code": "Clave"}
    total_rows: int
    rows: list[ImportPreviewRow]
    detected_count: int  # rows with both name + code


class ImportCommitPayload(BaseModel):
    company_id: int
    rows: list[dict]  # [{"name": str, "code": str}]


class ImportCommitResult(BaseModel):
    inserted: int
    skipped_duplicates: int
    errors: list[str]


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.patch("/{kind}/{item_id}")
def patch_dimension(kind: Kind, item_id: int, payload: DimensionUpdate, db: Session = Depends(get_db)):
    model = _resolve(kind)
    obj = db.get(model, item_id)
    if not obj:
        raise HTTPException(404, "not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return {"id": obj.id, "company_id": obj.company_id, "name": obj.name, "code": obj.code, "status": obj.status}


@router.delete("/{kind}/{item_id}", status_code=204)
def delete_dimension(kind: Kind, item_id: int, db: Session = Depends(get_db)):
    model = _resolve(kind)
    obj = db.get(model, item_id)
    if not obj:
        raise HTTPException(404, "not found")
    db.delete(obj)
    db.commit()


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
    # Fallbacks: first column = code, second = name
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
):
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
            # Try excel then csv
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
    # Cap preview to first 50 rows for payload size
    for i, row in df.head(50).iterrows():
        nm = str(row.get(name_col, "")).strip() if name_col else ""
        cd = str(row.get(code_col, "")).strip() if code_col else ""
        if nm and cd:
            detected += 1
        preview.append(ImportPreviewRow(
            row=int(i) + 2,  # +1 for 1-indexing, +1 for header row
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
def import_commit(kind: Kind, payload: ImportCommitPayload, db: Session = Depends(get_db)):
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
