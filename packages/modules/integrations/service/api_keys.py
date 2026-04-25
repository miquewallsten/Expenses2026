"""Platform API key issuance + verification (Phase 4.2).

Plaintext keys look like ``foplat_<24-base32-chars>``. We never persist the
plaintext — only the SHA-256 hex digest plus the first 8 chars (key prefix)
for fast lookup. Verification reads the prefix from the inbound header,
filters by it, then constant-time compares hashes.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime
from typing import Sequence

from sqlalchemy.orm import Session

from packages.modules.integrations.models_public_api import PlatformApiKey


_KEY_PREFIX = "foplat_"
_RAW_BYTES = 24
_PREFIX_LEN = 8


def _hash(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


def generate_api_key(
    db: Session,
    *,
    company_id: int,
    name: str,
    scopes: Sequence[str],
    created_by_user_id: int | None = None,
) -> tuple[PlatformApiKey, str]:
    """Mint a new API key. Returns (row, plaintext) — show plaintext exactly once."""
    # Base32, lowercased, no padding — alphanumeric, easy to copy.
    raw = secrets.token_hex(_RAW_BYTES)
    plaintext = f"{_KEY_PREFIX}{raw}"
    row = PlatformApiKey(
        company_id=company_id,
        key_prefix=plaintext[:_PREFIX_LEN],
        hashed_secret=_hash(plaintext),
        name=name,
        scopes=list(scopes),
        created_by_user_id=created_by_user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row, plaintext


def verify_api_key(db: Session, plaintext: str | None) -> PlatformApiKey | None:
    """Return the matching active key row, or None if invalid/revoked."""
    if not plaintext or not plaintext.startswith(_KEY_PREFIX):
        return None
    expected_hash = _hash(plaintext)
    candidates = (
        db.query(PlatformApiKey)
        .filter(
            PlatformApiKey.key_prefix == plaintext[:_PREFIX_LEN],
            PlatformApiKey.revoked_at.is_(None),
        )
        .all()
    )
    for row in candidates:
        if hmac.compare_digest(row.hashed_secret, expected_hash):
            row.last_used_at = datetime.utcnow()
            db.commit()
            return row
    return None


def revoke_api_key(db: Session, key_id: int, *, company_id: int) -> bool:
    row = (
        db.query(PlatformApiKey)
        .filter(
            PlatformApiKey.id == key_id, PlatformApiKey.company_id == company_id
        )
        .one_or_none()
    )
    if row is None or row.revoked_at is not None:
        return False
    row.revoked_at = datetime.utcnow()
    db.commit()
    return True


def has_scope(row: PlatformApiKey, required: str) -> bool:
    """A key has a scope if it's listed verbatim or via a ``*`` wildcard root.

    ``expenses:read`` is granted by ``expenses:read``, ``expenses:*``, or ``*``.
    """
    scopes = row.scopes or []
    if "*" in scopes or required in scopes:
        return True
    root = required.split(":", 1)[0]
    return f"{root}:*" in scopes
