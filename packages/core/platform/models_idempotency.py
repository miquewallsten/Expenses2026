"""Phase 2.1 — Idempotency record table.

Generic key-value cache for HTTP idempotency. A request with header
``Idempotency-Key: <opaque>`` on a state-changing endpoint stores its JSON
response under ``(user_id, route, key)``. Subsequent requests with the same
triple return the cached payload instead of re-executing the transition.

Records older than 24h are eligible for cleanup but are not auto-pruned —
storage cost is trivial.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)

from apps.api.db import Base


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"

    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    route = Column(String(200), nullable=False)
    idempotency_key = Column(String(120), nullable=False)
    status_code = Column(Integer, nullable=False, default=200)
    response_json = Column(Text, nullable=False)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "route",
            "idempotency_key",
            name="uq_idempotency_user_route_key",
        ),
    )
