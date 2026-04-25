"""IntegrationAdapter protocol — Phase 4.3.

Each adapter wraps a vendor-specific integration. The runner calls one of the
endpoint methods (``export_polizas``, ``sync_users``, ``sync_cost_centers``)
inside a controlled transaction, recording an ``IntegrationSyncRun`` row with
the result.

Adapters are pure: they read from the DB, build a payload, and return an
``AdapterResult``. They do NOT write the SyncRun themselves — the runner
service does that based on the returned result.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from sqlalchemy.orm import Session

from packages.modules.integrations.models import Integration


@dataclass
class AdapterResult:
    """Outcome of one adapter invocation."""

    items_ok: int = 0
    items_failed: int = 0
    error_summary: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    artifacts: dict[str, bytes | str] = field(default_factory=dict)

    @property
    def status(self) -> str:
        if self.items_failed and self.items_ok:
            return "partial"
        if self.items_failed and not self.items_ok:
            return "failed"
        return "succeeded"


class IntegrationAdapter(Protocol):
    """Vendor adapter contract.

    Implementations should be stateless modulo their bound ``integration``.
    """

    vendor: str

    def export_polizas(
        self, db: Session, integration: Integration, period: str | None = None
    ) -> AdapterResult: ...

    def sync_users(
        self, db: Session, integration: Integration
    ) -> AdapterResult: ...

    def sync_cost_centers(
        self, db: Session, integration: Integration
    ) -> AdapterResult: ...
