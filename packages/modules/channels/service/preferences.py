"""Phase 1.7 — per-user notification channel preferences.

Three lookups:

1. Specific row matching ``(user_id, event_type, channel)`` wins.
2. Wildcard row ``(user_id, "*", channel)`` is the per-channel master switch.
3. No row → defaults to enabled.

Wildcard ``*`` for ``event_type`` mirrors common opt-out UX: "stop emailing me
about anything" without enumerating every transactional category.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.core.platform.models_user_notification_pref import (
    UserNotificationPreference,
)


def _channel_attr(channel: str) -> str:
    if channel == "email":
        return "email_enabled"
    if channel == "whatsapp":
        return "whatsapp_enabled"
    raise ValueError(f"Unsupported channel: {channel}")


def is_channel_enabled(
    db: Session, user_id: int, event_type: str, channel: str
) -> bool:
    """Return True iff the user wants ``event_type`` over ``channel``.

    Defaults to True if no preference rows exist (opt-out model).
    """
    attr = _channel_attr(channel)
    rows = db.execute(
        select(UserNotificationPreference).where(
            UserNotificationPreference.user_id == user_id,
            UserNotificationPreference.event_type.in_((event_type, "*")),
        )
    ).scalars().all()
    if not rows:
        return True
    # Specific event_type wins over wildcard.
    specific = next((r for r in rows if r.event_type == event_type), None)
    wildcard = next((r for r in rows if r.event_type == "*"), None)
    chosen = specific or wildcard
    return bool(getattr(chosen, attr))


def list_preferences(db: Session, user_id: int) -> list[UserNotificationPreference]:
    return list(
        db.execute(
            select(UserNotificationPreference)
            .where(UserNotificationPreference.user_id == user_id)
            .order_by(UserNotificationPreference.event_type.asc())
        ).scalars()
    )


def upsert_preference(
    db: Session,
    *,
    user_id: int,
    event_type: str,
    email_enabled: bool | None = None,
    whatsapp_enabled: bool | None = None,
    digest_only: bool | None = None,
) -> UserNotificationPreference:
    row = db.execute(
        select(UserNotificationPreference).where(
            UserNotificationPreference.user_id == user_id,
            UserNotificationPreference.event_type == event_type,
        )
    ).scalar_one_or_none()

    if row is None:
        row = UserNotificationPreference(
            user_id=user_id,
            event_type=event_type,
            email_enabled=True if email_enabled is None else email_enabled,
            whatsapp_enabled=(
                True if whatsapp_enabled is None else whatsapp_enabled
            ),
            digest_only=False if digest_only is None else digest_only,
        )
        db.add(row)
    else:
        if email_enabled is not None:
            row.email_enabled = email_enabled
        if whatsapp_enabled is not None:
            row.whatsapp_enabled = whatsapp_enabled
        if digest_only is not None:
            row.digest_only = digest_only

    db.commit()
    db.refresh(row)
    return row
