"""Service for recording and querying immutable audit events."""

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from packages.core.platform.models_audit_event import AuditEvent


class AuditEventService:
    """Service for creating and querying audit trail records.

    Audit events are immutable - once created, they cannot be modified or deleted.
    This ensures a complete, tamper-proof history of all state changes in the system.
    """

    def __init__(self, db: Session):
        self.db = db

    def record(
        self,
        company_id: int,
        event_type: str,
        entity_type: str,
        entity_id: int,
        actor_id: int | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        before: dict[str, Any] | None = None,
        after: dict[str, Any] | None = None,
        correlation_id: str | None = None,
    ) -> AuditEvent:
        """Create an immutable audit event.

        Args:
            company_id: Tenant identifier
            event_type: Type of event (from AUDIT_EVENT_TYPES)
            entity_type: Model type (Expense, Document, etc.)
            entity_id: Primary key of the entity
            actor_id: User who performed the action (None for system actions)
            ip_address: Client IP for security auditing
            user_agent: Client browser/app info
            before: JSON snapshot before the change (None for creations)
            after: JSON snapshot after the change (None for deletions)
            correlation_id: Links related events in a workflow chain

        Returns:
            The created AuditEvent instance
        """
        event = AuditEvent(
            company_id=company_id,
            event_type=event_type,
            entity_type=entity_type,
            entity_id=entity_id,
            actor_id=actor_id,
            ip_address=ip_address,
            user_agent=user_agent,
            before=json.dumps(before) if before is not None else None,
            after=json.dumps(after) if after is not None else None,
            correlation_id=correlation_id,
        )

        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)

        return event

    def get_entity_history(
        self,
        entity_type: str,
        entity_id: int,
        limit: int = 100,
    ) -> list[AuditEvent]:
        """Get all events for a specific entity, ordered chronologically.

        Args:
            entity_type: Model type (Expense, Document, etc.)
            entity_id: Primary key of the entity
            limit: Maximum number of events to return

        Returns:
            List of AuditEvent instances ordered by occurred_at ascending
        """
        return (
            self.db.query(AuditEvent)
            .filter(AuditEvent.entity_type == entity_type)
            .filter(AuditEvent.entity_id == entity_id)
            .order_by(AuditEvent.occurred_at.asc())
            .limit(limit)
            .all()
        )

    def get_company_events(
        self,
        company_id: int,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        event_types: list[str] | None = None,
        limit: int = 1000,
    ) -> list[AuditEvent]:
        """Get events for a company within a date range.

        Args:
            company_id: Tenant identifier
            start_date: Optional start of date range (inclusive)
            end_date: Optional end of date range (inclusive)
            event_types: Optional list of event types to filter
            limit: Maximum number of events to return

        Returns:
            List of AuditEvent instances ordered by occurred_at descending
        """
        query = self.db.query(AuditEvent).filter(AuditEvent.company_id == company_id)

        if start_date is not None:
            query = query.filter(AuditEvent.occurred_at >= start_date)

        if end_date is not None:
            query = query.filter(AuditEvent.occurred_at <= end_date)

        if event_types is not None and len(event_types) > 0:
            query = query.filter(AuditEvent.event_type.in_(event_types))

        return query.order_by(AuditEvent.occurred_at.desc()).limit(limit).all()

    def export_to_dict(
        self,
        company_id: int,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """Export audit trail for client downloads (Excel, JSON).

        Converts AuditEvent records to dictionaries with before/after
        fields parsed from JSON strings to Python dicts.

        Args:
            company_id: Tenant identifier
            start_date: Optional start of date range (inclusive)
            end_date: Optional end of date range (inclusive)

        Returns:
            List of dictionaries with parsed before/after fields
        """
        events = self.get_company_events(company_id, start_date, end_date)

        result = []
        for event in events:
            event_dict = {
                "id": event.id,
                "company_id": event.company_id,
                "event_type": event.event_type,
                "entity_type": event.entity_type,
                "entity_id": event.entity_id,
                "actor_id": event.actor_id,
                "occurred_at": event.occurred_at.isoformat() if event.occurred_at else None,
                "ip_address": event.ip_address,
                "user_agent": event.user_agent,
                "before": json.loads(event.before) if event.before else None,
                "after": json.loads(event.after) if event.after else None,
                "correlation_id": event.correlation_id,
            }
            result.append(event_dict)

        return result