"""Tests for AgentPushService and NotificationService."""

from __future__ import annotations

import pytest

from packages.modules.agent.core.agent_push_service import AgentPushService, AgentNotification
from packages.modules.agent.core.notification_service import NotificationService


class TestAgentPushService:
    def test_send_notification(self):
        svc = AgentPushService()
        n = AgentNotification(id="", type="alert", title="T", message="M")
        result = svc.send_notification(user_id=1, notification=n)
        assert result.id.startswith("agent-push-")
        assert result.title == "T"
        assert result.message == "M"

    def test_get_user_notifications(self):
        svc = AgentPushService()
        svc.send_notification(1, AgentNotification(id="", type="suggestion", title="S", message="M"))
        notes = svc.get_user_notifications(1)
        assert len(notes) == 1
        assert notes[0].type == "suggestion"

    def test_get_user_notifications_empty(self):
        svc = AgentPushService()
        assert svc.get_user_notifications(99) == []

    def test_dismiss_notification(self):
        svc = AgentPushService()
        n = svc.send_notification(1, AgentNotification(id="", type="alert", title="T", message="M"))
        ok = svc.dismiss_notification(1, n.id)
        assert ok is True
        assert svc.get_user_notifications(1) == []

    def test_dismiss_notification_missing(self):
        svc = AgentPushService()
        ok = svc.dismiss_notification(1, "no-such-id")
        assert ok is False

    def test_check_triggers_pending_approvals(self):
        svc = AgentPushService()
        notes = svc.check_triggers(1, {"pending_approvals": 3})
        assert len(notes) == 1
        assert notes[0].type == "alert"
        assert "3 expense(s) awaiting approval" in notes[0].message

    def test_check_triggers_unsubmitted_expenses(self):
        svc = AgentPushService()
        notes = svc.check_triggers(1, {"unsubmitted_expenses": 2})
        assert len(notes) == 1
        assert notes[0].type == "suggestion"
        assert "2 unsubmitted" in notes[0].message

    def test_check_triggers_policy_violations(self):
        svc = AgentPushService()
        notes = svc.check_triggers(1, {"policy_violations": 1})
        assert len(notes) == 1
        assert notes[0].type == "alert"
        assert "violate updated policy" in notes[0].message

    def test_check_triggers_multiple(self):
        svc = AgentPushService()
        notes = svc.check_triggers(
            1, {"pending_approvals": 2, "unsubmitted_expenses": 1, "policy_violations": 1}
        )
        assert len(notes) == 3
        types = {n.type for n in notes}
        assert types == {"alert", "suggestion"}

    def test_check_triggers_zero_does_not_notify(self):
        svc = AgentPushService()
        notes = svc.check_triggers(1, {"pending_approvals": 0, "unsubmitted_expenses": 0})
        assert notes == []

    def test_persisted_after_check(self):
        svc = AgentPushService()
        svc.check_triggers(1, {"pending_approvals": 1})
        persisted = svc.get_user_notifications(1)
        assert len(persisted) == 1


class TestNotificationService:
    def test_send_announcement(self):
        svc = NotificationService()
        ann = svc.send_announcement(company_id=1, title="Hello", message="World")
        assert ann.id.startswith("ann-")
        assert ann.company_id == 1
        assert ann.target_roles == ["all"]

    def test_send_announcement_with_targets(self):
        svc = NotificationService()
        ann = svc.send_announcement(
            company_id=1, title="T", message="M",
            target_roles=["managers"], channels=["mywork", "email"]
        )
        assert ann.target_roles == ["managers"]
        assert ann.channels == ["mywork", "email"]

    def test_get_user_notifications_all(self):
        svc = NotificationService()
        svc.send_announcement(1, "Title", "Msg")
        notes = svc.get_user_notifications(user_id=1, user_role="employee", company_id=1)
        assert len(notes) == 1
        assert notes[0]["title"] == "Title"
        assert notes[0]["type"] == "announcement"

    def test_get_user_notifications_role_filter(self):
        svc = NotificationService()
        svc.send_announcement(1, "T", "M", target_roles=["managers"])
        mgr_notes = svc.get_user_notifications(user_id=1, user_role="manager", company_id=1)
        emp_notes = svc.get_user_notifications(user_id=1, user_role="employee", company_id=1)
        assert len(mgr_notes) == 1
        assert len(emp_notes) == 0

    def test_dismiss_announcement(self):
        svc = NotificationService()
        svc.send_announcement(1, "T", "M")
        svc.dismiss_notification(user_id=1, notification_id="ann-1")
        notes = svc.get_user_notifications(user_id=1, user_role="employee", company_id=1)
        assert len(notes) == 0
