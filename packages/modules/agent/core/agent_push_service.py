"""Proactive notification service for the unified Agent.

Pushes context-aware notifications to users based on real-time triggers
(pending approvals, unsubmitted expenses, policy violations).

Stores per-user notifications in memory; a future migration will persist
to the database.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

NotificationType = Literal["suggestion", "alert", "announcement"]


@dataclass
class AgentNotification:
    id: str
    type: NotificationType
    title: str
    message: str
    action: dict[str, Any] | None = None
    dismissed: bool = False


class AgentPushService:
    """In-memory push notification engine.

    ``_inbox`` maps ``user_id`` → list of notifications.
    ``_seq`` provides monotonic integer IDs scoped to this process.
    """

    def __init__(self) -> None:
        self._inbox: dict[int, list[AgentNotification]] = {}
        self._seq = 0

    def _next_id(self) -> str:
        self._seq += 1
        return f"agent-push-{self._seq}"

    # ── Public API ────────────────────────────────────────────────────────────

    def send_notification(
        self,
        user_id: int,
        notification: AgentNotification,
    ) -> AgentNotification:
        """Push a notification to a user's inbox."""
        if notification.id is None or notification.id == "":
            notification.id = self._next_id()
        self._inbox.setdefault(user_id, []).append(notification)
        return notification

    def get_user_notifications(self, user_id: int) -> list[AgentNotification]:
        """Return all non-dismissed notifications for a user."""
        return [n for n in self._inbox.get(user_id, []) if not n.dismissed]

    def dismiss_notification(self, user_id: int, notification_id: str) -> bool:
        """Mark a notification as dismissed. Returns True if found."""
        for n in self._inbox.get(user_id, []):
            if n.id == notification_id:
                n.dismissed = True
                return True
        return False

    def check_triggers(
        self,
        user_id: int,
        context: dict[str, Any],
    ) -> list[AgentNotification]:
        """Evaluate context and return a list of proactive notifications.

        Expected context keys (all optional):
            pending_approvals:   int
            unsubmitted_expenses: int
            policy_violations:   int
        """
        notifications: list[AgentNotification] = []

        pending = int(context.get("pending_approvals", 0))
        if pending > 0:
            notifications.append(
                AgentNotification(
                    id=self._next_id(),
                    type="alert",
                    title="Pending approvals",
                    message=f"You have {pending} expense(s) awaiting approval",
                    action={"route": "/mywork/approvals", "label": "Review"},
                )
            )

        unsubmitted = int(context.get("unsubmitted_expenses", 0))
        if unsubmitted > 0:
            notifications.append(
                AgentNotification(
                    id=self._next_id(),
                    type="suggestion",
                    title="Unsubmitted expenses",
                    message=f"You have {unsubmitted} unsubmitted expense(s)",
                    action={"route": "/mywork/expenses", "label": "Submit"},
                )
            )

        violations = int(context.get("policy_violations", 0))
        if violations > 0:
            notifications.append(
                AgentNotification(
                    id=self._next_id(),
                    type="alert",
                    title="Policy violations",
                    message="Recent expenses violate updated policy",
                    action={"route": "/mywork/expenses", "label": "Review"},
                )
            )

        # Persist so they appear in GET /notifications
        for n in notifications:
            self.send_notification(user_id, n)

        return notifications


# Singleton used by the router.
PUSH_SERVICE = AgentPushService()
