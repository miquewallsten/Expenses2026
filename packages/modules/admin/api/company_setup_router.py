from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
import io
import os
import uuid

from apps.api.auth import require_admin
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

_UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "uploads", "logos")
_ALLOWED_MIME = {
    "image/png", "image/jpeg", "image/jpg", "image/gif",
    "image/webp", "image/bmp", "image/tiff", "image/x-icon",
}
_MAX_BYTES = 8 * 1024 * 1024  # 8 MB


class DeleteResponse(BaseModel):
    success: bool


router = APIRouter(prefix="/admin/company-setup", tags=["admin"], dependencies=[Depends(require_admin)])


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


@router.post("/{company_id}/logo")
def upload_company_logo(
    company_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Accept any image format, process with Pillow (resize + convert to WebP), persist URL."""
    # ── Validation ─────────────────────────────────────────────────────────────
    content_type = (file.content_type or "").lower()
    if content_type not in _ALLOWED_MIME:
        raise HTTPException(status_code=415, detail=f"Unsupported image type: {content_type}")

    raw = file.file.read()
    if len(raw) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 8 MB limit")

    # ── Process with Pillow ────────────────────────────────────────────────────
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(raw))
        img = img.convert("RGBA")

        # Resize: max 512 px on the longest side, preserve aspect ratio
        max_side = 512
        w, h = img.size
        if max(w, h) > max_side:
            ratio = max_side / max(w, h)
            img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

        # Convert to WebP
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=92)
        processed = buf.getvalue()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not process image: {exc}") from exc

    # ── Persist ────────────────────────────────────────────────────────────────
    os.makedirs(_UPLOADS_DIR, exist_ok=True)
    filename = f"company_{company_id}_{uuid.uuid4().hex[:8]}.webp"
    dest = os.path.join(_UPLOADS_DIR, filename)

    # Remove previous logo for this company (keep disk tidy)
    for old in os.listdir(_UPLOADS_DIR):
        if old.startswith(f"company_{company_id}_") and old.endswith(".webp"):
            try:
                os.remove(os.path.join(_UPLOADS_DIR, old))
            except OSError:
                pass

    with open(dest, "wb") as f:
        f.write(processed)

    logo_url = f"/uploads/logos/{filename}"

    # ── Save URL on company setup ──────────────────────────────────────────────
    from packages.modules.admin.schemas.company_setup import CompanySetupUpdate as _Upd
    setup = upsert_company_setup(db, company_id, _Upd(logo_url=logo_url))
    return {"logo_url": logo_url}


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


# ── Phase 4.6 — onboarding wizard ──────────────────────────────────────────

class OnboardingStepUpdate(BaseModel):
    onboarding_step: int


class OnboardingChecklistItem(BaseModel):
    ok: bool
    label: str
    detail: str | None = None
    count: int | None = None


class OnboardingChecklistResponse(BaseModel):
    company_id: int
    items: dict[str, OnboardingChecklistItem]
    passed: int
    total: int
    go_live_ready: bool
    onboarding_step: int
    onboarding_completed_at: str | None = None


@router.get(
    "/{company_id}/checklist",
    response_model=OnboardingChecklistResponse,
)
def get_onboarding_checklist(company_id: int, db: Session = Depends(get_db)):
    from packages.modules.admin.service.onboarding_service import compute_checklist
    return compute_checklist(db, company_id)


@router.patch("/{company_id}/onboarding-step", response_model=CompanySetupRead)
def patch_onboarding_step(
    company_id: int,
    data: OnboardingStepUpdate,
    db: Session = Depends(get_db),
):
    from packages.modules.admin.service.onboarding_service import set_onboarding_step
    try:
        return set_onboarding_step(db, company_id, data.onboarding_step)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
