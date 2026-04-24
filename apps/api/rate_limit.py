"""Rate-limit helpers built on slowapi.

Exposes a single shared `limiter` so all routers can attach @limiter.limit(...)
decorators and share one middleware / handler. Per-endpoint limits use the
`key_func` override on `.limit()` when a different key (IP vs user) is needed.

Defaults:
  - default (all endpoints)  600/min keyed on user-or-ip
  - auth endpoints            10/min keyed on ip
  - AI endpoints              30/min keyed on user-or-ip

Overridable via env: RATE_LIMIT_DEFAULT, RATE_LIMIT_AUTH, RATE_LIMIT_AI.
"""

from __future__ import annotations

import os

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def user_or_ip_key(request: Request) -> str:
    """Key by authenticated user id; fall back to dev header; then remote IP."""
    user = getattr(request.state, "user", None)
    if user is not None:
        return f"user:{getattr(user, 'id', '?')}"
    x_user = request.headers.get("x-user-id")
    if x_user:
        return f"user:{x_user}"
    return f"ip:{get_remote_address(request)}"


RATE_LIMIT_DEFAULT = os.environ.get("RATE_LIMIT_DEFAULT", "600/minute")
RATE_LIMIT_AUTH    = os.environ.get("RATE_LIMIT_AUTH",    "10/minute")
RATE_LIMIT_AI      = os.environ.get("RATE_LIMIT_AI",      "30/minute")


limiter = Limiter(
    key_func=user_or_ip_key,
    default_limits=[RATE_LIMIT_DEFAULT],
)
