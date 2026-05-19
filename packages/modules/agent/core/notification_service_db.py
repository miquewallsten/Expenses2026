"""Database-backed notification service.

Drop-in replacement for the in-memory NotificationService that persists
announcements and reads to PostgreSQL.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from packages.modules.agent.models_notification import Notification, NotificationRead

log = logging.getLogger(__name__)


@dataclass
class DBNotification:
    id: int
    company_id: int
    title: str
    message: str
    type: str
    target_roles: list[str] | None
    channels: list[str] | None
    created_at: str


class DBNotificationService:
    """PostgreSQL-backed notification service.

    API-compatible with the in-memory NotificationService so the router
    doesn't need to change.
    """

    def send_announcement(
        self,
        db: Session,
        *,
        company_id: int,
        title: str,
        message: str,
        target_roles: list[str] | None = None,
        channels: list[str] | None = None,
    ) -> DBNotification:
        row = Notification(
            company_id=company_id,
            title=title,
            message=message,
            type="announcement",
            target_roles=json.dumps(target_roles) if target_roles else None,
            channels=json.dumps(channels) if channels else None,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return DBNotification(
            id=row.id,
            company_id=row.company_id,
            title=row.title,
            message=row.message,
            type=row.type,
            target_roles=json.loads(row.target_roles) if row.target_roles else None,
            channels=json.loads(row.channels) if row.channels else None,
            created_at=row.created_at.isoformat() if row.created_at else "",
        )

    def get_user_notifications(
        self,
        db: Session,
        *,
        user_id: int,
        user_role: str,
        company_id: int,
    ) -> list[dict[str, Any]]:
        """Return all active announcements for the user's company, marking
        which ones they've already read."""
        rows = (
            db.query(Notification)
            .filter(Notification.company_id == company_id)
            .order_by(Notification.created_at.desc())
            .limit(50)
            .all()
        )
        read_ids = {
            r.notification_id
            for r in db.query(NotificationRead.notification_id)
            .filter(NotificationRead.user_id == user_id)
            .all()
        }
        result = []
        for r in rows:
            # Filter by role if target_roles is set
            target_roles = json.loads(r.target_roles) if r.target_roles else None
            if target_roles and user_role not in target_roles and "all" not in target_roles:
                continue
            result.append({
                "id": f"ann-{r.id}",
                "type": r.type,
                "title": r.title,
                "message": r.message,
                "action": None,
                "read": r.id in read_ids,
            })
        return result

    def dismiss_notification(self, db: Session, user_id: int, notification_id: str) -> bool:
        """Mark a notification as read. notification_id may be 'ann-123' or bare int."""
        try:
            nid = int(notification_id.replace("ann-", "")) if notification_id.startswith("ann-") else int(notification_id)
        except (ValueError, AttributeError):
            return False
        existing = (
            db.query(NotificationRead)
            .filter(
                NotificationRead.notification_id == nid,
                NotificationRead.user_id == user_id,
            )
            .first()
        )
        if existing:
            return True  # Already read
        db.add(NotificationRead(notification_id=nid, user_id=user_id))
        db.commit()
        return True


DB_NOTIFICATION_SERVICE = DBNotificationService()
