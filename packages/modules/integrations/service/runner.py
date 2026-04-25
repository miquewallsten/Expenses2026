"""Run an adapter endpoint — records IntegrationSyncRun (Phase 4.3)."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from sqlalchemy.orm import Session

from packages.modules.integrations.models import Integration, IntegrationSyncRun
from packages.modules.integrations.service.adapters import (
    AdapterResult,
    get_adapter,
)


EndpointName = Literal["export_polizas", "sync_users", "sync_cost_centers"]


def run_endpoint(
    db: Session,
    *,
    integration: Integration,
    endpoint: EndpointName,
    period: str | None = None,
    triggered_by_user_id: int | None = None,
) -> tuple[IntegrationSyncRun, AdapterResult]:
    adapter = get_adapter(integration.vendor)
    if adapter is None:
        run = IntegrationSyncRun(
            integration_id=integration.id,
            endpoint=endpoint,
            direction="outbound",
            status="failed",
            started_at=datetime.utcnow(),
            finished_at=datetime.utcnow(),
            items_ok=0,
            items_failed=0,
            error_summary=f"no adapter registered for vendor {integration.vendor!r}",
            triggered_by_user_id=triggered_by_user_id,
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return run, AdapterResult(error_summary=run.error_summary)

    started = datetime.utcnow()
    try:
        if endpoint == "export_polizas":
            result = adapter.export_polizas(db, integration, period=period)
        elif endpoint == "sync_users":
            result = adapter.sync_users(db, integration)
        elif endpoint == "sync_cost_centers":
            result = adapter.sync_cost_centers(db, integration)
        else:
            raise ValueError(f"unknown endpoint {endpoint!r}")
    except Exception as exc:
        result = AdapterResult(
            items_failed=1, error_summary=f"{type(exc).__name__}: {exc}"
        )

    run = IntegrationSyncRun(
        integration_id=integration.id,
        endpoint=endpoint,
        direction="outbound",
        status=result.status,
        started_at=started,
        finished_at=datetime.utcnow(),
        items_ok=result.items_ok,
        items_failed=result.items_failed,
        error_summary=result.error_summary,
        triggered_by_user_id=triggered_by_user_id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run, result
