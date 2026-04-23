"""Secret redaction helpers.

Used in two places:
    1. Before persisting tool arguments to ``agent_tool_calls.args_redacted``.
    2. Before forwarding tool results back to the LLM as context.

No secret value should survive either path.
"""

from __future__ import annotations

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


def _looks_sensitive(key: str) -> bool:
    k = key.lower()
    return any(k == suf or k.endswith("_" + suf) or k.endswith(suf) for suf in _SECRET_SUFFIXES)


def redact(value: Any) -> Any:
    """Recursively strip values under sensitive-looking keys.

    Preserves structure — replaces the value with ``***REDACTED***`` rather
    than removing the key, so downstream diffs still line up.
    """
    if isinstance(value, dict):
        return {
            k: (_REDACTED if _looks_sensitive(k) else redact(v))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [redact(v) for v in value]
    return value
