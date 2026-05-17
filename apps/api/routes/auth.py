"""auth_router.py — Magic Link authentication endpoints.

Flow:
  POST /auth/magic-link/request  →  create token, send/log link
  GET  /auth/magic-link/verify   →  validate token, return JWT session

In development (ENVIRONMENT=development) the magic link URL is returned
directly in the response body so no SMTP configuration is needed.

In production set:
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
  APP_BASE_URL  (e.g. https://app.example.com)
  AUTH_SECRET   (random 32-char secret for signing JWTs)
"""

import logging
import os
import secrets
import smtplib
import email.mime.text
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from apps.api.config import settings
from apps.api.deps import get_db
from apps.api.rate_limit import RATE_LIMIT_AUTH, limiter
from packages.core.platform.models_user import MagicLinkToken, User

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# ── Config ────────────────────────────────────────────────────────────────────

_ENV         = settings.environment.lower()
_SECRET      = settings.auth_secret
_BASE_URL    = os.environ.get("APP_BASE_URL", "http://localhost:3000")
_TOKEN_TTL   = int(os.environ.get("MAGIC_LINK_TTL_MINUTES", "15"))
_SESSION_TTL = int(os.environ.get("SESSION_TTL_HOURS", "24"))

_SMTP_HOST = os.environ.get("SMTP_HOST", "")
_SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
_SMTP_USER = os.environ.get("SMTP_USER", "")
_SMTP_PASS = os.environ.get("SMTP_PASSWORD", "")
_SMTP_FROM = os.environ.get("SMTP_FROM", "noreply@financial-ops.local")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _issue_session_jwt(user: User) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=_SESSION_TTL)).timestamp()),
        "is_super_admin": bool(getattr(user, "is_super_admin", False)),
    }
    # Only include company_id for tenant users (super-admins have no company)
    if user.company_id is not None:
        payload["company_id"] = user.company_id
    return jwt.encode(payload, _SECRET, algorithm="HS256")


def _send_email(to: str, link: str) -> None:
    """Send the magic link via SMTP.  Only called when SMTP_HOST is configured."""
    body = (
        f"Click the link below to sign in to Financial Ops Platform.\n\n"
        f"{link}\n\n"
        f"This link expires in {_TOKEN_TTL} minutes and can only be used once.\n\n"
        f"If you did not request this, ignore this email."
    )
    msg = email.mime.text.MIMEText(body, "plain")
    msg["Subject"] = "Your Financial Ops sign-in link"
    msg["From"]    = _SMTP_FROM
    msg["To"]      = to
    try:
        with smtplib.SMTP(_SMTP_HOST, _SMTP_PORT, timeout=10) as s:
            s.starttls()
            if _SMTP_USER:
                s.login(_SMTP_USER, _SMTP_PASS)
            s.sendmail(_SMTP_FROM, [to], msg.as_string())
        _log.info("Magic link email sent to %s", to)
    except Exception:
        _log.exception("Failed to send magic link email to %s", to)
        raise HTTPException(status_code=503, detail="Failed to send email. Contact your administrator.")


# ── Schemas ───────────────────────────────────────────────────────────────────

class MagicLinkRequest(BaseModel):
    email: EmailStr


class MagicLinkRequestResponse(BaseModel):
    status: str
    # Only populated in development — never send in production
    dev_link: str | None = None


class VerifyResponse(BaseModel):
    token: str
    user_id: int
    email: str
    role: str
    company_id: int | None = None
    full_name: str
    is_super_admin: bool = False


# --- Direct Super Admin Login (Bypass) ---

class SuperAdminDirectResponse(BaseModel):
    token: str
    user_id: int
    email: str
    role: str
    company_id: int | None = None
    full_name: str | None = None
    isSuperAdmin: bool = True


# --- Super Admin Password Login ---

class SuperAdminLoginRequest(BaseModel):
    email: EmailStr
    password: str


class SuperAdminLoginResponse(BaseModel):
    token: str
    user_id: int
    email: str
    full_name: str
    is_super_admin: bool = True


@router.post("/super-admin/login", response_model=SuperAdminLoginResponse)
@limiter.limit(RATE_LIMIT_AUTH, key_func=lambda request: request.client.host if request.client else "anon")
def super_admin_login(request: Request, body: SuperAdminLoginRequest, db: Session = Depends(get_db)):
    """Authenticate super-admin with email/password.

    Only users with is_super_admin=True AND a password_hash set can log in.
    """
    from packages.core.platform.password_utils import verify_password

    user = db.query(User).filter(User.email == body.email).first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    if not user.password_hash:
        raise HTTPException(status_code=403, detail="Super-admin account not configured for password login")

    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    # Update last_login_at
    user.last_login_at = datetime.now(tz=timezone.utc)
    db.commit()

    session_token = _issue_session_jwt(user)

    return SuperAdminLoginResponse(
        token=session_token,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_super_admin=True,
    )

@router.get("/superadmin-direct", response_model=SuperAdminDirectResponse)
def superadmin_direct_login(request: Request, token: str, db: Session = Depends(get_db)):
    """Direct login for super admin users — validates a pre-issued token against the DB.
    
    SECURITY: This endpoint verifies the token using the canonical AUTH_SECRET from
    settings (not os.getenv), validates the user exists in the database, and confirms
    they hold the is_super_admin flag. No MockUser bypass.
    """
    
    # Use the canonical secret from settings (not os.getenv with fallback)
    try:
        payload = jwt.decode(token, _SECRET, algorithms=["HS256"], audience="financial-ops-platform")
        user_id = int(payload["sub"])
        email = payload["email"]
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Look up the real user — no mock bypass
    user = db.query(User).filter(User.id == user_id, User.email == email).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    
    if not getattr(user, "is_super_admin", False):
        raise HTTPException(status_code=403, detail="Super admin access required")
    
    # Issue a proper session token via the canonical helper
    session_token = _issue_session_jwt(user)
    
    return SuperAdminDirectResponse(
        token=session_token,
        user_id=user.id,
        email=user.email,
        role=user.role,
        company_id=user.company_id,
        full_name=getattr(user, "full_name", "Super Administrator"),
        isSuperAdmin=True,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/magic-link/request", response_model=MagicLinkRequestResponse)
@limiter.limit(RATE_LIMIT_AUTH, key_func=lambda request: request.client.host if request.client else "anon")
def request_magic_link(request: Request, body: MagicLinkRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()

    # Always respond 200 even if email not found — prevents user enumeration
    if not user:
        _log.info("Magic link requested for unknown email: %s", body.email)
        return MagicLinkRequestResponse(status="sent")

    # Invalidate any unused, unexpired tokens for this user (one active link at a time)
    now = datetime.now(tz=timezone.utc)
    db.query(MagicLinkToken).filter(
        MagicLinkToken.user_id == user.id,
        MagicLinkToken.used_at.is_(None),
        MagicLinkToken.expires_at > now,
    ).delete()

    raw_token = secrets.token_urlsafe(48)
    link_token = MagicLinkToken(
        user_id=user.id,
        token=raw_token,
        expires_at=now + timedelta(minutes=_TOKEN_TTL),
    )
    db.add(link_token)
    db.commit()

    link = f"{_BASE_URL}/auth/verify?token={raw_token}"

    # Phase 1.3 — route through unified Notifier (renders es/en templates,
    # writes a NotificationDispatch row, and uses per-company SMTP). The
    # router falls back to suppression when SMTP is unconfigured, so dev
    # behaviour (return link in response) is unchanged below.
    notifier_succeeded = False
    try:
        from packages.modules.channels.service.event_router import (
            notify_magic_link,
        )

        notify_magic_link(
            db,
            user,
            link=link,
            ttl_minutes=_TOKEN_TTL,
            token_id=link_token.id,
        )
        notifier_succeeded = True
    except Exception:
        _log.exception("Notifier dispatch failed for magic-link to %s", user.email)

    if _SMTP_HOST or notifier_succeeded:
        # Legacy direct SMTP path retained as a redundant safety net while we
        # migrate. If Notifier sent the email successfully the recipient
        # receives one copy thanks to per-(event, recipient, channel)
        # idempotency on the Notifier side; this path is best-effort and
        # never raises into production traffic.
        try:
            _send_email(user.email, link)
        except HTTPException:
            pass
        return MagicLinkRequestResponse(status="sent")
    else:
        # Development: return link in response so the console can show it
        _log.info("DEV magic link for %s: %s", user.email, link)
        return MagicLinkRequestResponse(status="sent", dev_link=link)


@router.get("/magic-link/verify", response_model=VerifyResponse)
@limiter.limit(RATE_LIMIT_AUTH, key_func=lambda request: request.client.host if request.client else "anon")
def verify_magic_link(request: Request, token: str, db: Session = Depends(get_db)):
    now = datetime.now(tz=timezone.utc)

    link_token = (
        db.query(MagicLinkToken)
        .filter(MagicLinkToken.token == token)
        .first()
    )

    if not link_token:
        raise HTTPException(status_code=400, detail="Invalid or expired link")
    if link_token.used_at is not None:
        raise HTTPException(status_code=400, detail="This link has already been used")
    if link_token.expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(status_code=400, detail="This link has expired")

    # Mark used
    link_token.used_at = now
    db.commit()

    user = db.query(User).filter(User.id == link_token.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    session_token = _issue_session_jwt(user)

    return VerifyResponse(
        token=session_token,
        user_id=user.id,
        email=user.email,
        role=user.role,
        company_id=user.company_id,
        full_name=user.full_name,
        is_super_admin=bool(getattr(user, "is_super_admin", False)),
    )
