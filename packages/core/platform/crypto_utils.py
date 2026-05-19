"""Symmetric encryption helpers for storing secrets at rest.

Uses Fernet (AES-128-CBC with HMAC-SHA256) with a key derived from
``settings.auth_secret``. The key is cached at module level for the
process lifetime — rotation requires a server restart and a migration
that re-encrypts all existing rows.

Usage::

    from packages.core.platform.crypto_utils import encrypt_secret, decrypt_secret

    stored = encrypt_secret("sk-abc123")
    plain  = decrypt_secret(stored)   # "sk-abc123"

If ``AUTH_SECRET`` is not set (dev/test), values are stored in plaintext
with a ``plain:`` prefix so the system degrades gracefully.
"""

from __future__ import annotations

import os
import base64
import hashlib
import logging

_log = logging.getLogger(__name__)

# Lazy-initialised Fernet instance.
_fernet = None


def _get_fernet():
    """Derive a Fernet key from AUTH_SECRET. Cached for process lifetime."""
    global _fernet
    if _fernet is not None:
        return _fernet

    secret = os.environ.get("AUTH_SECRET", "")
    if not secret:
        # No secret configured — plaintext mode. Never use in production.
        _log.warning("AUTH_SECRET not set — secret values will be stored in plaintext!")
        _fernet = False  # Sentinel: plaintext mode
        return False

    from cryptography.fernet import Fernet
    # Derive a 32-byte key from AUTH_SECRET using SHA-256, then base64url-encode
    # to satisfy Fernet's key format requirements.
    key = hashlib.sha256(secret.encode("utf-8")).digest()
    fernet_key = base64.urlsafe_b64encode(key)
    _fernet = Fernet(fernet_key)
    return _fernet


_PREFIX_PLAIN = "plain:"
_PREFIX_FERNET = "f:"


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a secret string for storage. Returns an opaque string."""
    f = _get_fernet()
    if f is False:
        # Plaintext mode
        return f"{_PREFIX_PLAIN}{plaintext}"
    encrypted = f.encrypt(plaintext.encode("utf-8"))
    return f"{_PREFIX_FERNET}{encrypted.decode('ascii')}"


def decrypt_secret(stored: str) -> str:
    """Decrypt a secret string from storage. Returns the original plaintext."""
    if stored.startswith(_PREFIX_PLAIN):
        return stored[len(_PREFIX_PLAIN):]
    if stored.startswith(_PREFIX_FERNET):
        f = _get_fernet()
        if f is False:
            # In plaintext mode but value is Fernet-encrypted (shouldn't happen normally)
            raise ValueError("Cannot decrypt Fernet value without AUTH_SECRET")
        encrypted = stored[len(_PREFIX_FERNET):].encode("ascii")
        return f.decrypt(encrypted).decode("utf-8")
    # Unprefixed — assume plaintext (legacy data)
    return stored


def is_encrypted(value: str | None) -> bool:
    """Check whether a stored value is Fernet-encrypted."""
    if value is None:
        return False
    return value.startswith(_PREFIX_FERNET)
