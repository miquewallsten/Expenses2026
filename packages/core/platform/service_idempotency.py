"""Phase 2.1 — Idempotency cache for state-changing endpoints.

Usage in a router:

    from packages.core.platform.service_idempotency import (
        idempotency_lookup,
        idempotency_store,
        IdempotencyKey,
    )

    @router.post("/foo")
    def foo(
        body: FooBody,
        idem: IdempotencyKey,            # ← Header dependency
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
    ):
        cached = idempotency_lookup(db, user.id, "POST /foo", idem)
        if cached is not None:
            return cached
        result = do_work(db, body)
        idempotency_store(db, user.id, "POST /foo", idem, result)
        return result

The header is optional; when omitted, every call re-executes (current
behaviour preserved). Keys are scoped per (user, route) — two users sending
the same key never collide, and the same key on different endpoints is a
different cache entry.
"""

from __future__ import annotations

import json
from typing import Annotated, Any

from fastapi import Header
from sqlalchemy.orm import Session

from packages.core.platform.models_idempotency import IdempotencyRecord


# Optional header — None means caller did not opt-in to idempotency.
IdempotencyKey = Annotated[
    str | None,
    Header(
        alias="Idempotency-Key",
        max_length=120,
        description="Optional opaque token. Repeats return the cached response.",
    ),
]


def idempotency_lookup(
    db: Session,
    user_id: int,
    route: str,
    key: str | None,
) -> Any | None:
    """Return the cached JSON response, or None if no key / no record."""
    if not key:
        return None
    row = (
        db.query(IdempotencyRecord)
        .filter(
            IdempotencyRecord.user_id == user_id,
            IdempotencyRecord.route == route,
            IdempotencyRecord.idempotency_key == key,
        )
        .one_or_none()
    )
    if row is None:
        return None
    try:
        return json.loads(row.response_json)
    except json.JSONDecodeError:
        return None


def idempotency_store(
    db: Session,
    user_id: int,
    route: str,
    key: str | None,
    payload: Any,
    *,
    status_code: int = 200,
) -> None:
    """Persist the response payload under (user, route, key). Best-effort.

    If a row with the same key already exists (race) we silently ignore so
    the original cached value wins.
    """
    if not key:
        return
    try:
        body_json = json.dumps(payload, default=str)
    except (TypeError, ValueError):
        return  # non-serialisable response; skip caching
    rec = IdempotencyRecord(
        user_id=user_id,
        route=route,
        idempotency_key=key,
        status_code=status_code,
        response_json=body_json,
    )
    db.add(rec)
    try:
        db.commit()
    except Exception:
        db.rollback()
