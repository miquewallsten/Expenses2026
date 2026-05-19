"""Tests for AuditEventService - audit trail recording and querying."""

import json
from datetime import datetime, timedelta, timezone

import pytest

from packages.modules.admin.service.audit_event_service import AuditEventService
from packages.core.platform.models_audit_event import AuditEvent


class TestAuditEventService:
    """Tests for AuditEventService class methods."""

    def test_record_expense_created(self, db_session, test_company, test_user):
        """Test recording expense creation event."""
        service = AuditEventService(db_session)

        event = service.record(
            company_id=test_company.id,
            event_type="expense.created",
            entity_type="Expense",
            entity_id=1,
            actor_id=test_user.id,
            before=None,
            after={"amount": 100.0, "description": "Test expense"},
        )

        assert event.id is not None
        assert event.company_id == test_company.id
        assert event.event_type == "expense.created"
        assert event.entity_type == "Expense"
        assert event.entity_id == 1
        assert event.actor_id == test_user.id
        assert event.occurred_at is not None
        assert isinstance(event.occurred_at, datetime)

        # Verify before/after are stored as JSON strings
        assert event.before is None
        assert json.loads(event.after) == {"amount": 100.0, "description": "Test expense"}

    def test_record_with_correlation_id(self, db_session, test_company, test_user):
        """Test linking related events via correlation_id."""
        service = AuditEventService(db_session)

        correlation_id = "abc123-def456-ghi789"

        # Create first event in a chain
        event1 = service.record(
            company_id=test_company.id,
            event_type="expense.submitted",
            entity_type="Expense",
            entity_id=1,
            actor_id=test_user.id,
            correlation_id=correlation_id,
        )

        # Create second linked event
        event2 = service.record(
            company_id=test_company.id,
            event_type="expense.manager_approved",
            entity_type="Expense",
            entity_id=1,
            actor_id=test_user.id,
            correlation_id=correlation_id,
        )

        assert event1.correlation_id == correlation_id
        assert event2.correlation_id == correlation_id

        # Both events should be queryable by correlation_id
        events = (
            db_session.query(AuditEvent)
            .filter(AuditEvent.correlation_id == correlation_id)
            .all()
        )
        assert len(events) == 2

    def test_get_entity_history(self, db_session, test_company, test_user):
        """Test retrieving all events for an entity."""
        service = AuditEventService(db_session)

        # Create multiple events for same expense
        service.record(
            company_id=test_company.id,
            event_type="expense.created",
            entity_type="Expense",
            entity_id=1,
            actor_id=test_user.id,
        )
        service.record(
            company_id=test_company.id,
            event_type="expense.submitted",
            entity_type="Expense",
            entity_id=1,
            actor_id=test_user.id,
        )
        service.record(
            company_id=test_company.id,
            event_type="expense.approved",
            entity_type="Expense",
            entity_id=1,
            actor_id=test_user.id,
        )

        # Create event for different expense
        service.record(
            company_id=test_company.id,
            event_type="expense.created",
            entity_type="Expense",
            entity_id=2,
            actor_id=test_user.id,
        )

        # Get history for expense 1
        history = service.get_entity_history("Expense", 1)

        assert len(history) == 3
        assert [e.event_type for e in history] == [
            "expense.created",
            "expense.submitted",
            "expense.approved",
        ]

    def test_get_company_events_in_range(self, db_session, test_company, test_user):
        """Test querying events by company and date range."""
        service = AuditEventService(db_session)

        now = datetime.now(timezone.utc)

        # Create events at different times (simulated)
        event1 = service.record(
            company_id=test_company.id,
            event_type="expense.created",
            entity_type="Expense",
            entity_id=1,
            actor_id=test_user.id,
        )

        # Query all events for company
        all_events = service.get_company_events(test_company.id)
        assert len(all_events) == 1

        # Query with date range
        start_date = now - timedelta(days=1)
        end_date = now + timedelta(days=1)

        ranged_events = service.get_company_events(
            test_company.id, start_date=start_date, end_date=end_date
        )
        assert len(ranged_events) == 1

        # Query with event_types filter
        filtered_events = service.get_company_events(
            test_company.id, event_types=["expense.created"]
        )
        assert len(filtered_events) == 1

        # Filter with non-matching event type
        empty_events = service.get_company_events(
            test_company.id, event_types=["expense.rejected"]
        )
        assert len(empty_events) == 0

    def test_export_audit_trail_to_dict(self, db_session, test_company, test_user):
        """Test exporting audit trail for client downloads."""
        service = AuditEventService(db_session)

        # Create multiple events
        service.record(
            company_id=test_company.id,
            event_type="expense.created",
            entity_type="Expense",
            entity_id=1,
            actor_id=test_user.id,
            before=None,
            after={"amount": 100.0, "description": "Test"},
        )

        service.record(
            company_id=test_company.id,
            event_type="expense.approved",
            entity_type="Expense",
            entity_id=1,
            actor_id=test_user.id,
            before={"status": "submitted"},
            after={"status": "approved"},
        )

        # Export to dict
        trail = service.export_to_dict(test_company.id)

        assert len(trail) == 2

        # Verify dict structure
        first_event = trail[0]
        assert "id" in first_event
        assert "company_id" in first_event
        assert "event_type" in first_event
        assert "entity_type" in first_event
        assert "entity_id" in first_event
        assert "actor_id" in first_event
        assert "occurred_at" in first_event

        # Events are ordered by occurred_at desc, so first is most recent (approved)
        # Verify before/after are parsed from JSON strings
        assert first_event["before"] == {"status": "submitted"}
        assert first_event["after"] == {"status": "approved"}

        second_event = trail[1]
        assert second_event["before"] is None
        assert second_event["after"] == {"amount": 100.0, "description": "Test"}

    def test_record_with_request_metadata(self, db_session, test_company, test_user):
        """Test recording with IP address and user agent."""
        service = AuditEventService(db_session)

        event = service.record(
            company_id=test_company.id,
            event_type="user.login",
            entity_type="User",
            entity_id=test_user.id,
            actor_id=test_user.id,
            ip_address="192.168.1.1",
            user_agent="Mozilla/5.0 (Test Browser)",
        )

        assert event.ip_address == "192.168.1.1"
        assert event.user_agent == "Mozilla/5.0 (Test Browser)"

    def test_tenant_isolation(self, db_session, test_company, test_user):
        """Test that company events are isolated by tenant."""
        from packages.core.platform.models import Company

        service = AuditEventService(db_session)

        # Create another company
        company2 = Company(name="Other Company", slug="other-co")
        db_session.add(company2)
        db_session.commit()
        db_session.refresh(company2)

        # Create events for both companies
        service.record(
            company_id=test_company.id,
            event_type="expense.created",
            entity_type="Expense",
            entity_id=1,
            actor_id=test_user.id,
        )

        service.record(
            company_id=company2.id,
            event_type="expense.created",
            entity_type="Expense",
            entity_id=1,
            actor_id=test_user.id,
        )

        # Query for each company
        company1_events = service.get_company_events(test_company.id)
        company2_events = service.get_company_events(company2.id)

        assert len(company1_events) == 1
        assert len(company2_events) == 1
        assert company1_events[0].company_id == test_company.id
        assert company2_events[0].company_id == company2.id