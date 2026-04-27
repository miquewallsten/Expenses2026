"""Secret redaction helpers.

Used in two places:
    1. Before persisting tool arguments to ``agent_tool_calls.args_redacted``.
    2. Before forwarding tool results back to the LLM as context.

No secret value should survive either path.
"""

from __future__ import annotations

import re
from typing import Any

# Keys that must be scrubbed from any dict passed through ``redact``.
# Matched case-insensitively by suffix so ``wa_access_token``,
# ``email_webhook_secret`` etc are all caught.
_SECRET_SUFFIXES: tuple[str, ...] = (
    "password",
    "passwd",
    "secret",
    "token",
    "api_key",
    "apikey",
    "access_key",
    "private_key",
    "sso_metadata_url",  # may contain signed bearer URL
)

_REDACTED = "***REDACTED***"

# Phase 8.7 — PII value patterns. Anchored so that obvious matches in free
# text are scrubbed before the value reaches the LLM or audit log.
#   • RFC: 3–4 letter prefix + 6 digits + 3 alphanumerics (Mexican tax ID)
#   • CURP: 18-char Mexican personal ID
#   • email: RFC-loose
#   • phone: 10 digit blocks with optional separators / +52 country code
_PII_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("rfc",   re.compile(r"\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b", re.IGNORECASE)),
    ("curp",  re.compile(r"\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b", re.IGNORECASE)),
    ("email", re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")),
    # Mexican phone: optional +52 / 52, optional spacing/dashes/dots, 10 digits.
    ("phone", re.compile(r"(?:\+?52[\s.-]?)?(?:\(?\d{2,3}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{4}\b")),
)


def _looks_sensitive(key: str) -> bool:
    k = key.lower()
    return any(k == suf or k.endswith("_" + suf) or k.endswith(suf) for suf in _SECRET_SUFFIXES)


def _scrub_pii(text: str) -> str:
    out = text
    for label, pat in _PII_PATTERNS:
        out = pat.sub(f"[{label.upper()}]", out)
    return out


def redact(value: Any) -> Any:
    """Recursively strip values under sensitive-looking keys and scrub PII.

    Preserves structure — replaces values under sensitive keys with
    ``***REDACTED***``, and rewrites PII patterns inside string values
    (RFC, CURP, email, phone) with bracketed placeholders.
    """
    if isinstance(value, dict):
        return {
            k: (_REDACTED if _looks_sensitive(k) else redact(v))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, str):
        return _scrub_pii(value)
    return value

