"""Signed, one-time-use action links — Phase 1.4.

JWTs allow stateless verification (HMAC w/ ``settings.auth_secret``) and the
``action_links`` table enforces single-use + audit. Tokens carry only
``action``, ``resource_type``, ``resource_id``, ``user_id``, ``company_id``,
``jti``, ``exp``.

Flow:
    create_action_token(...) → row + signed JWT string.
    consume_token(token, ip) → looks up row by jti, ensures unused + unexpired,
    marks used. Raises ``ActionLinkError`` on any rejection.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.config import settings
from packages.modules.channels.models import ActionLink

ALGORITHM = "HS256"
DEFAULT_TTL_SECONDS = 86400  # 24 h


class ActionLinkError(Exception):
    """Generic action-link rejection. Detail attribute is user-safe."""

    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class ActionTokenClaims:
    jti: str
    user_id: int
    company_id: int
    action: str
    resource_type: str
    resource_id: int
    exp: int


# ── Issuance ─────────────────────────────────────────────────────────────────

def create_action_token(
    db: Session,
    *,
    user_id: int,
    company_id: int,
    action: str,
    resource_type: str,
    resource_id: int,
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
    ip: str | None = None,
) -> tuple[str, ActionLink]:
    """Issue a signed token and persist its single-use record. Returns (token, row)."""
    now = datetime.now(tz=timezone.utc)
    exp = now + timedelta(seconds=ttl_seconds)
    jti = secrets.token_urlsafe(24)

    payload = {
        "jti": jti,
        "uid": user_id,
        "co": company_id,
        "act": action,
        "rt": resource_type,
        "ri": resource_id,
        "exp": int(exp.timestamp()),
    }
    token = jwt.encode(payload, settings.auth_secret, algorithm=ALGORITHM)

    row = ActionLink(
        token_jti=jti,
        company_id=company_id,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        expires_at=exp,
        created_ip=ip,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return token, row


# ── Validation / consumption ─────────────────────────────────────────────────

def _decode(token: str) -> ActionTokenClaims:
    try:
        decoded = jwt.decode(token, settings.auth_secret, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise ActionLinkError("expired", "This link has expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise ActionLinkError("invalid", "This link is invalid.") from exc

    try:
        return ActionTokenClaims(
            jti=decoded["jti"],
            user_id=int(decoded["uid"]),
            company_id=int(decoded["co"]),
            action=str(decoded["act"]),
            resource_type=str(decoded["rt"]),
            resource_id=int(decoded["ri"]),
            exp=int(decoded["exp"]),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise ActionLinkError("malformed", "This link is malformed.") from exc


def inspect_token(db: Session, token: str) -> tuple[ActionTokenClaims, ActionLink]:
    """Decode + look up DB row. Raises if invalid/expired/already-used.

    Does NOT mark the row as used — call :func:`consume_token` for that.
    """
    claims = _decode(token)
    row = db.execute(
        select(ActionLink).where(ActionLink.token_jti == claims.jti)
    ).scalar_one_or_none()
    if row is None:
        raise ActionLinkError("unknown", "This link is no longer valid.")
    if row.used_at is not None:
        raise ActionLinkError("used", "This link has already been used.")
    # Defence in depth — DB row reflects authoritative expiry.
    if row.expires_at is not None:
        expires_at = row.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(tz=timezone.utc):
            raise ActionLinkError("expired", "This link has expired.")
    if (
        row.user_id != claims.user_id
        or row.company_id != claims.company_id
        or row.action != claims.action
        or row.resource_type != claims.resource_type
        or row.resource_id != claims.resource_id
    ):
        raise ActionLinkError("mismatch", "This link is invalid.")
    return claims, row


def consume_token(
    db: Session, token: str, *, ip: str | None = None
) -> tuple[ActionTokenClaims, ActionLink]:
    """Atomically mark the row as used. Raises on any reuse / mismatch."""
    claims, row = inspect_token(db, token)
    row.used_at = datetime.now(tz=timezone.utc)
    row.consumed_ip = ip
    db.commit()
    return claims, row
