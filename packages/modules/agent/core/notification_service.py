"""Announcement / broadcast notification service.

Targets users by role or department and delivers via in-memory store
(channel delivery to email/whatsapp is stubbed for now).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass
class Announcement:
    id: str
    company_id: int
    title: str
    message: str
    target_roles: list[str]
    channels: list[str]
    created_at: str = field(default="")


class NotificationService:
    """In-memory announcement store.

    ``_announcements`` maps ``company_id`` → list of announcements.
    ``_user_reads`` maps ``(user_id, announcement_id)`` → dismissed bool.
    """

    def __init__(self) -> None:
        self._announcements: dict[int, list[Announcement]] = {}
        self._user_reads: dict[tuple[int, str], bool] = {}
        self._seq = 0

    def _next_id(self) -> str:
        self._seq += 1
        return f"ann-{self._seq}"

    # ── Public API ────────────────────────────────────────────────────────────

    def send_announcement(
        self,
        company_id: int,
        title: str,
        message: str,
        target_roles: list[str] | None = None,
        channels: list[str] | None = None,
    ) -> Announcement:
        """Create an announcement scoped to a company.

        target_roles: e.g. ["all"], ["employees"], ["managers"], ["accounting"]
        channels:     e.g. ["mywork"], ["mywork", "email"], etc.
        """
        from datetime import datetime, timezone

        ann = Announcement(
            id=self._next_id(),
            company_id=company_id,
            title=title,
            message=message,
            target_roles=target_roles or ["all"],
            channels=channels or ["mywork"],
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        self._announcements.setdefault(company_id, []).append(ann)
        return ann

    def get_user_notifications(
        self,
        user_id: int,
        user_role: str,
        company_id: int,
    ) -> list[dict[str, Any]]:
        """Return visible announcements for this user that have not been dismissed."""
        out: list[dict[str, Any]] = []
        for ann in self._announcements.get(company_id, []):
            if not self._role_matches(user_role, ann.target_roles):
                continue
            if self._user_reads.get((user_id, ann.id)):
                continue
            out.append({
                "id": ann.id,
                "type": "announcement",
                "title": ann.title,
                "message": ann.message,
                "channels": ann.channels,
                "created_at": ann.created_at,
            })
        return out

    def dismiss_notification(
        self,
        user_id: int,
        notification_id: str,
    ) -> bool:
        """Dismiss an announcement for a user."""
        self._user_reads[(user_id, notification_id)] = True
        return True

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _role_matches(user_role: str, target_roles: list[str]) -> bool:
        if "all" in target_roles:
            return True
        # Map logical targets to concrete role names
        role_map: dict[str, list[str]] = {
            "employees": ["employee"],
            "managers": ["manager"],
            "accounting": ["accountant"],
        }
        for target in target_roles:
            if target == user_role:
                return True
            if user_role in role_map.get(target, []):
                return True
        return False


# Singleton used by the router.
NOTIFICATION_SERVICE = NotificationService()
