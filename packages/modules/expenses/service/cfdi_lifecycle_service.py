"""cfdi_lifecycle_service.py — Phase 4.8 SAT cancel watcher.

Periodically re-queries SAT for CFDI status on approved expenses with a
known UUID. When a CFDI flips from "Vigente" to "Cancelado", the expense
is flagged and a `cfdi.cancelled` webhook event is emitted so accountants
can pause exports and start a reversal workflow.

This module is monkeypatchable in tests via ``check_cfdi_with_sat``.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.service.sat_validation_service import (
    check_cfdi_with_sat,
)
from packages.modules.integrations.service.webhooks import emit_event
from packages.modules.agent.models import AgentInsight

_log = logging.getLogger(__name__)


def recheck_expense_cfdi(
    db: Session,
    expense: Expense,
    *,
    emisor_rfc: str = "",
    receptor_rfc: str = "",
    total: str = "",
) -> dict[str, Any]:
    """Re-query SAT for one expense's CFDI; persist status; emit event on flip.

    Returns a dict with keys: status, changed (bool), cancelled (bool).
    Safe to call when expense.cfdi_uuid is None — returns no-op.
    """
    uuid = (expense.cfdi_uuid or "").strip()
    if not uuid:
        return {"status": None, "changed": False, "cancelled": False}

    prior = expense.cfdi_status
    result = check_cfdi_with_sat(uuid, emisor_rfc, receptor_rfc, total or str(expense.amount))
    new_status = result.get("sat_status") or prior

    expense.cfdi_status = new_status
    expense.cfdi_last_checked_at = datetime.utcnow()
    db.add(expense)
    db.commit()
    db.refresh(expense)

    changed = bool(prior != new_status)
    cancelled_flip = bool(prior != "Cancelado" and new_status == "Cancelado")
    if cancelled_flip:
        emit_event(
            db,
            company_id=expense.company_id,
            event_type="cfdi.cancelled",
            resource_type="expense",
            resource_id=expense.id,
            payload={
                "expense_id": expense.id,
                "cfdi_uuid": uuid,
                "previous_status": prior,
                "current_status": new_status,
                "checked_at": expense.cfdi_last_checked_at.isoformat() + "Z",
            },
        )
        # Create Agent Insight for Lola background task feedback
        insight = AgentInsight(
            company_id=expense.company_id,
            kind="cfdi_cancelled",
            severity="critical",
            title=f"CFDI Cancelado: {expense.description}",
            body=f"El SAT reporta que la factura {uuid} del gasto #{expense.id} por ${expense.amount} ha sido cancelada.",
            data_json=json.dumps({
                "expense_id": expense.id,
                "cfdi_uuid": uuid,
                "amount": float(expense.amount),
            }),
            suggested_prompt=f"¿Qué debo hacer con el gasto #{expense.id} que tiene factura cancelada?",
        )
        db.add(insight)
        db.commit()
    return {"status": new_status, "changed": changed, "cancelled": cancelled_flip}


def recheck_pending(
    db: Session,
    *,
    company_id: int | None = None,
    stale_after_days: int = 7,
    batch_size: int = 100,
) -> dict[str, int]:
    """Iterate expenses with a CFDI UUID whose last check is stale (or absent).

    Skips expenses already marked Cancelado. Returns counts.
    """
    cutoff = datetime.utcnow() - timedelta(days=max(0, stale_after_days))
    q = (
        db.query(Expense)
        .filter(
            Expense.cfdi_uuid.is_not(None),
            Expense.status == "approved",
        )
    )
    if company_id is not None:
        q = q.filter(Expense.company_id == company_id)
    rows = q.order_by(Expense.id.asc()).limit(max(1, min(batch_size, 1000))).all()

    checked = 0
    flipped = 0
    skipped = 0
    for e in rows:
        if e.cfdi_status == "Cancelado":
            skipped += 1
            continue
        if e.cfdi_last_checked_at is not None and e.cfdi_last_checked_at > cutoff:
            skipped += 1
            continue
        try:
            res = recheck_expense_cfdi(db, e)
        except Exception:
            _log.exception("CFDI recheck failed for expense %s", e.id)
            continue
        checked += 1
        if res.get("cancelled"):
            flipped += 1
    return {"checked": checked, "flipped": flipped, "skipped": skipped}
