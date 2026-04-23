# Skill: /new-module

Scaffold a complete, production-ready module for this financial-ops-platform monorepo.

## How to invoke

```
/new-module <snake_case_name> "<Short description>"
```

Example: `/new-module vendor_payments "Vendor payment requests and approvals"`

## What this skill does

Generates every layer — backend models → schemas → service → authenticated router → main.py registration → Alembic migration → frontend panel → i18n keys — following the established conventions of this codebase exactly.

---

## Step-by-step instructions

### 0. Parse args

Extract from the user's invocation:
- `MODULE_NAME` — snake_case (e.g. `vendor_payments`)
- `MODULE_LABEL` — human label in Spanish MX (derive from description, e.g. "Pagos a Proveedores")
- `MODULE_LABEL_EN` — English label (e.g. "Vendor Payments")
- `MODULE_DESC_ES` — one-sentence Spanish MX description for i18n hints
- `MODULE_DESC_EN` — one-sentence English description

If the user didn't supply a description, ask for one before proceeding.

Derive these from MODULE_NAME:
- `MODULE_CLASS` — PascalCase (e.g. `VendorPayment`)
- `MODULE_SLUG` — kebab-case (e.g. `vendor-payments`)
- `MODULE_PREFIX` — API prefix (e.g. `/vendor-payments`)

---

### 1. Read the latest Alembic revision ID

```bash
ls alembic/versions/ | sort | tail -1
```

Open that file and read its `revision = "..."` value. This becomes `DOWN_REVISION`.

Generate a new revision ID: 8-char hex string, e.g. `f3a7c1e2b9d4`. Make it unique (not matching any existing file prefix).

---

### 2. Create backend files

#### `packages/modules/{MODULE_NAME}/__init__.py`
```python
```
(empty — just marks it as a package)

#### `packages/modules/{MODULE_NAME}/models.py`
```python
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from apps.api.db import Base


class {MODULE_CLASS}(Base):
    __tablename__ = "{MODULE_NAME}s"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    title      = Column(String(255), nullable=False)
    status     = Column(String(50), nullable=False, server_default="draft")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
```

Add more domain columns that make sense for the module description.

#### `packages/modules/{MODULE_NAME}/schemas.py`
```python
from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class {MODULE_CLASS}Create(BaseModel):
    company_id: int
    title: str


class {MODULE_CLASS}Update(BaseModel):
    title: str | None = None
    status: str | None = None


class {MODULE_CLASS}Read(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    title: str
    status: str
    created_at: datetime
    updated_at: datetime
```

#### `packages/modules/{MODULE_NAME}/service.py`
```python
from sqlalchemy.orm import Session
from packages.modules.{MODULE_NAME}.models import {MODULE_CLASS}
from packages.modules.{MODULE_NAME}.schemas import {MODULE_CLASS}Create, {MODULE_CLASS}Update


def list_{MODULE_NAME}s(db: Session, company_id: int) -> list[{MODULE_CLASS}]:
    return (
        db.query({MODULE_CLASS})
        .filter({MODULE_CLASS}.company_id == company_id)
        .order_by({MODULE_CLASS}.created_at.desc())
        .all()
    )


def get_{MODULE_NAME}(db: Session, item_id: int) -> {MODULE_CLASS} | None:
    return db.query({MODULE_CLASS}).filter({MODULE_CLASS}.id == item_id).first()


def create_{MODULE_NAME}(db: Session, payload: {MODULE_CLASS}Create) -> {MODULE_CLASS}:
    item = {MODULE_CLASS}(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_{MODULE_NAME}(db: Session, item_id: int, payload: {MODULE_CLASS}Update) -> {MODULE_CLASS} | None:
    item = get_{MODULE_NAME}(db, item_id)
    if not item:
        return None
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


def delete_{MODULE_NAME}(db: Session, item_id: int) -> bool:
    item = get_{MODULE_NAME}(db, item_id)
    if not item:
        return False
    db.delete(item)
    db.commit()
    return True
```

#### `packages/modules/{MODULE_NAME}/api/__init__.py`
(empty)

#### `packages/modules/{MODULE_NAME}/api/router.py`
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.{MODULE_NAME}.schemas import (
    {MODULE_CLASS}Create,
    {MODULE_CLASS}Read,
    {MODULE_CLASS}Update,
)
from packages.modules.{MODULE_NAME}.service import (
    create_{MODULE_NAME},
    delete_{MODULE_NAME},
    get_{MODULE_NAME},
    list_{MODULE_NAME}s,
    update_{MODULE_NAME},
)

router = APIRouter(prefix="{MODULE_PREFIX}", tags=["{MODULE_SLUG}"])


@router.get("/", response_model=list[{MODULE_CLASS}Read])
def list_route(
    company_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        company_id = current_user.company_id
    if not company_id:
        raise HTTPException(status_code=400, detail="company_id required")
    return list_{MODULE_NAME}s(db, company_id)


@router.post("/", response_model={MODULE_CLASS}Read)
def create_route(
    payload: {MODULE_CLASS}Create,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(payload.company_id, current_user)
    return create_{MODULE_NAME}(db, payload)


@router.get("/{item_id}", response_model={MODULE_CLASS}Read)
def get_route(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = get_{MODULE_NAME}(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if current_user.role != "admin" and item.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cross-company access is not allowed")
    return item


@router.patch("/{item_id}", response_model={MODULE_CLASS}Read)
def update_route(
    item_id: int,
    payload: {MODULE_CLASS}Update,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = get_{MODULE_NAME}(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if current_user.role != "admin" and item.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cross-company access is not allowed")
    return update_{MODULE_NAME}(db, item_id, payload)


@router.delete("/{item_id}", status_code=204)
def delete_route(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = get_{MODULE_NAME}(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    if current_user.role != "admin" and item.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cross-company access is not allowed")
    delete_{MODULE_NAME}(db, item_id)
```

---

### 3. Register in `apps/api/main.py`

**Model import** (add near the other model imports, before `app = FastAPI(...)`):
```python
from packages.modules.{MODULE_NAME}.models import {MODULE_CLASS}  # noqa: F401 — registers {MODULE_NAME}s table
```

**Router import + mount** (add near the bottom of the imports block, then add `app.include_router` call):
```python
from packages.modules.{MODULE_NAME}.api.router import router as {MODULE_NAME}_router
```
```python
app.include_router({MODULE_NAME}_router)
```

---

### 4. Create Alembic migration

File: `alembic/versions/{NEW_REVISION_ID}_add_{MODULE_NAME}.py`

```python
"""add {MODULE_NAME}

Revision ID: {NEW_REVISION_ID}
Revises: {DOWN_REVISION}
Create Date: {TODAY_ISO_DATE}

"""
from alembic import op
import sqlalchemy as sa

revision = "{NEW_REVISION_ID}"
down_revision = "{DOWN_REVISION}"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "{MODULE_NAME}s",
        sa.Column("id",         sa.Integer(),    primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.Integer(),    nullable=False),
        sa.Column("title",      sa.String(255),  nullable=False),
        sa.Column("status",     sa.String(50),   nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(),   nullable=False),
        sa.Column("updated_at", sa.DateTime(),   nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
    )
    op.create_index("ix_{MODULE_NAME}s_company_id", "{MODULE_NAME}s", ["company_id"])


def downgrade() -> None:
    op.drop_index("ix_{MODULE_NAME}s_company_id", table_name="{MODULE_NAME}s")
    op.drop_table("{MODULE_NAME}s")
```

Adjust columns to match the model you created in step 2.

---

### 5. Scaffold frontend panel

File: `web/components/{MODULE_SLUG}/{MODULE_CLASS}Panel.tsx`

Follow the design system from `web/CLAUDE.md` strictly:
- Dark-mode only — `bg-zinc-950`, `bg-zinc-900`, `border-white/[0.07]`
- Text: `text-white/60` (primary), `text-white/45` (secondary), `text-white/28` (muted)
- Accent: `bg-indigo-600/30`, `text-indigo-300/80`, `border-indigo-500/25`
- Section labels: `text-[10px] font-bold uppercase tracking-widest text-white/35`
- Never use `neutral-*` — only `zinc-*` or `white/opacity`

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getAuthHeaders } from "@/lib/session";
// choose a relevant lucide icon
import { Package, Loader2, Plus } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface {MODULE_CLASS}Item {
  id: number;
  company_id: number;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Props {
  companyId: number;
}

export default function {MODULE_CLASS}Panel({ companyId }: Props) {
  const t = useTranslations("{MODULE_NAME}");
  const [items, setItems]     = useState<{MODULE_CLASS}Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}{MODULE_PREFIX}/?company_id=${companyId}`, {
      headers: getAuthHeaders(),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setItems)
      .catch(() => setError(t("loadError")))
      .finally(() => setLoading(false));
  }, [companyId, t]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-white/20">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">{t("loading")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-white/25" />
        <h2 className="text-sm font-semibold text-white">{t("title")}</h2>
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 rounded border border-white/[0.09] bg-white/[0.04] px-2.5 py-1 text-[10px] text-white/45 transition-colors hover:border-white/20 hover:text-white/70"
        >
          <Plus className="h-3 w-3" />
          {t("new")}
        </button>
      </div>

      {error && (
        <p className="rounded border border-red-500/15 bg-red-500/[0.06] px-3 py-2 text-[11px] text-red-400/70">
          {error}
        </p>
      )}

      {/* List */}
      <div className="overflow-hidden rounded-lg border border-white/[0.07]">
        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-[11px] text-white/25">{t("empty")}</p>
        ) : (
          <ul>
            {items.map((item, i) => (
              <li
                key={item.id}
                className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.04] ${
                  i < items.length - 1 ? "border-b border-white/[0.05]" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-white/70">{item.title}</p>
                  <p className="text-[10px] text-white/28">{item.status}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

---

### 6. Add i18n keys

**Spanish MX is the primary language. Add to `web/messages/es.json` FIRST.**
The namespace key is `MODULE_NAME`.

```json
"{MODULE_NAME}": {
  "title": "{MODULE_LABEL}",
  "new": "Nuevo",
  "empty": "Sin registros.",
  "loading": "Cargando…",
  "loadError": "No se pudo cargar la información.",
  "status": {
    "draft": "Borrador",
    "submitted": "Enviado",
    "approved": "Aprobado",
    "rejected": "Rechazado"
  }
}
```

**Then add the English backup to `web/messages/en.json`:**

```json
"{MODULE_NAME}": {
  "title": "{MODULE_LABEL_EN}",
  "new": "New",
  "empty": "No records found.",
  "loading": "Loading…",
  "loadError": "Failed to load data.",
  "status": {
    "draft": "Draft",
    "submitted": "Submitted",
    "approved": "Approved",
    "rejected": "Rejected"
  }
}
```

Both files use the same English key names. Only the string values differ.

---

### 7. Register model in `tests/conftest.py`

Add the model import so test SQLite sees the table:

```python
from packages.modules.{MODULE_NAME}.models import {MODULE_CLASS}  # noqa: F401
```

---

### 8. Run tests to verify nothing is broken

```bash
python -m pytest tests/ -x -q
```

All tests must pass before reporting completion. If a test fails, fix it.

---

## Conventions to enforce

| Rule | Where |
|------|--------|
| All routes require `get_current_user` dependency | `api/router.py` |
| Non-admin users are scoped to `current_user.company_id` on list routes | `api/router.py` |
| Cross-company access rejected with 403 for get/patch/delete | `api/router.py` |
| `model_config = ConfigDict(from_attributes=True)` on all Read schemas | `schemas.py` |
| Never `class Config:` — Pydantic V2 only | `schemas.py` |
| Frontend uses `getAuthHeaders()` from `@/lib/session` | `Panel.tsx` |
| Frontend uses `useTranslations("{MODULE_NAME}")` | `Panel.tsx` |
| Spanish MX strings written first, English strings second | `es.json` then `en.json` |
| Never `neutral-*` in Tailwind — use `zinc-*` or `white/opacity` | `Panel.tsx` |
| Migration `down_revision` must point to the actual latest revision | `alembic/versions/` |
| Model import added to both `apps/api/main.py` AND `tests/conftest.py` | — |

## What NOT to do

- Do not touch existing module code unless wiring the new router in `main.py`
- Do not add mock data or placeholder lorem ipsum strings
- Do not add comments explaining what the code does — only non-obvious WHYs
- Do not create extra abstraction layers (no base classes, no generic repositories)
- Do not add features not implied by the module description
