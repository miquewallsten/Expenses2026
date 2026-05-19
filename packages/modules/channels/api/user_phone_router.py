"""API for linking/unlinking users to their WhatsApp phone number.

This is how the system knows which user owns which phone number — 
critical for the WhatsApp agent to resolve inbound messages to the
correct user and apply their role-based permissions.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_admin
from apps.api.deps import get_db
from packages.core.platform.models_user import User

router = APIRouter(prefix="/users/whatsapp", tags=["users-whatsapp"])


# ── Link phone (admin or self) ────────────────────────────────────────────────

class LinkPhoneRequest(BaseModel):
    whatsapp_phone: str = Field(..., min_length=7, max_length=30, description="Phone number in E.164 format: +521234567890")


class LinkPhoneResponse(BaseModel):
    user_id: int
    whatsapp_phone: str
    whatsapp_verified: bool


@router.put("/{user_id}", response_model=LinkPhoneResponse)
def link_whatsapp_phone(
    user_id: int,
    body: LinkPhoneRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LinkPhoneResponse:
    """Link a WhatsApp phone number to a user account.
    
    The phone must be in E.164 format (e.g. +521234567890).
    Only admins can link phones for other users; regular users can only link their own.
    """
    # Authorization: admin can link any user; regular user can only link themselves
    if not getattr(current_user, 'is_super_admin', False) and current_user.role not in ("admin", "manager"):
        if current_user.id != user_id:
            raise HTTPException(status_code=403, detail="You can only link your own phone number.")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Normalize phone format
    phone = body.whatsapp_phone.strip()
    if not phone.startswith("+"):
        phone = "+" + phone

    # Check uniqueness (no two users can share the same WhatsApp number)
    existing = db.query(User).filter(
        User.whatsapp_phone == phone,
        User.id != user_id,
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"This phone number is already linked to user {existing.full_name} ({existing.email})."
        )

    user.whatsapp_phone = phone
    user.whatsapp_verified = True  # Admin-confirmed linking counts as verified
    user.whatsapp_verified_at = datetime.now(tz=timezone.utc)
    db.commit()
    db.refresh(user)

    return LinkPhoneResponse(
        user_id=user.id,
        whatsapp_phone=user.whatsapp_phone,
        whatsapp_verified=user.whatsapp_verified,
    )


# ── Unlink phone ──────────────────────────────────────────────────────────────

@router.delete("/{user_id}", response_model=LinkPhoneResponse)
def unlink_whatsapp_phone(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LinkPhoneResponse:
    """Remove the WhatsApp phone number from a user account."""
    if not getattr(current_user, 'is_super_admin', False) and current_user.role not in ("admin", "manager"):
        if current_user.id != user_id:
            raise HTTPException(status_code=403, detail="You can only unlink your own phone number.")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    old_phone = user.whatsapp_phone
    user.whatsapp_phone = None
    user.whatsapp_verified = False
    user.whatsapp_verified_at = None
    db.commit()
    db.refresh(user)

    return LinkPhoneResponse(
        user_id=user.id,
        whatsapp_phone=user.whatsapp_phone or "",
        whatsapp_verified=False,
    )


# ── List linked phones (admin) ────────────────────────────────────────────────

class UserPhoneRead(BaseModel):
    user_id: int
    full_name: str
    email: str
    role: str
    whatsapp_phone: str | None
    whatsapp_verified: bool


@router.get("/company/{company_id}", response_model=list[UserPhoneRead])
def list_company_phones(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> list[UserPhoneRead]:
    """List all users in a company with their WhatsApp phone status."""
    users = (
        db.query(User)
        .filter(User.company_id == company_id, User.is_active == True)  # noqa: E712
        .order_by(User.full_name)
        .all()
    )
    return [
        UserPhoneRead(
            user_id=u.id,
            full_name=u.full_name,
            email=u.email,
            role=u.role,
            whatsapp_phone=u.whatsapp_phone,
            whatsapp_verified=u.whatsapp_verified,
        )
        for u in users
    ]


# ── Bulk link (admin) ─────────────────────────────────────────────────────────

class BulkLinkItem(BaseModel):
    user_id: int
    whatsapp_phone: str = Field(..., min_length=7, max_length=30)


class BulkLinkRequest(BaseModel):
    links: list[BulkLinkItem]


class BulkLinkResponse(BaseModel):
    linked: int
    skipped: int
    errors: list[str]


@router.post("/bulk-link", response_model=BulkLinkResponse)
def bulk_link_phones(
    body: BulkLinkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> BulkLinkResponse:
    """Bulk link multiple users to their WhatsApp phone numbers."""
    linked = 0
    skipped = 0
    errors = []

    for item in body.links:
        user = db.query(User).filter(User.id == item.user_id).first()
        if user is None:
            errors.append(f"User {item.user_id} not found")
            skipped += 1
            continue

        phone = item.whatsapp_phone.strip()
        if not phone.startswith("+"):
            phone = "+" + phone

        # Check uniqueness
        existing = db.query(User).filter(
            User.whatsapp_phone == phone,
            User.id != item.user_id,
        ).first()
        if existing:
            errors.append(f"Phone {phone} already linked to {existing.full_name}")
            skipped += 1
            continue

        user.whatsapp_phone = phone
        user.whatsapp_verified = True
        user.whatsapp_verified_at = datetime.now(tz=timezone.utc)
        linked += 1

    db.commit()
    return BulkLinkResponse(linked=linked, skipped=skipped, errors=errors)
