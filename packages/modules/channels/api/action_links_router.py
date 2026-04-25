"""Public action-link endpoints (Phase 1.4).

Two routes:
* ``GET  /channels/action/{token}`` — minimal SSR confirmation page. Decodes
  the token + shows resource summary and a small HTML form to POST back.
* ``POST /channels/action/{token}`` — atomically consumes the token and
  performs the underlying expense transition.

Both endpoints are heavily rate-limited (5/min per IP) and write an
``audit_logs`` row on every consumption attempt.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from apps.api.rate_limit import limiter
from packages.core.platform.service_audit import log_event
from packages.modules.channels.service.action_links import (
    ActionLinkError,
    consume_token,
    inspect_token,
)
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.service.transition_service import (
    manager_approve_expense,
    manager_reject_expense,
    manager_return_expense,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/channels/action", tags=["channels-action"])

ACTION_LINK_RATE = "5/minute"


# ── HTML helpers ─────────────────────────────────────────────────────────────

_PAGE = """<!doctype html>
<html lang=\"es\">
<head>
  <meta charset=\"utf-8\">
  <title>{title}</title>
  <style>
    body{{margin:0;background:#18181b;color:#e4e4e7;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}}
    .card{{background:#27272a;border:1px solid #3f3f46;border-radius:8px;padding:32px;max-width:480px;width:90%}}
    h1{{font-size:18px;margin:0 0 16px;color:#fafafa}}
    p{{font-size:14px;color:#d4d4d8;margin:0 0 12px}}
    .meta{{font-size:12px;color:#a1a1aa}}
    button{{background:#4f46e5;color:#fff;border:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;cursor:pointer}}
    .err{{color:#fca5a5}}
  </style>
</head>
<body><div class=\"card\">{body}</div></body>
</html>"""


def _render_confirm(action: str, resource: str, token: str) -> str:
    label = {
        "approve": "Aprobar",
        "reject": "Rechazar",
        "return": "Devolver",
    }.get(action, action.title())
    body = (
        f"<h1>Confirmar acción: {label}</h1>"
        f"<p class=\"meta\">{resource}</p>"
        f"<p>Esta acción es definitiva y queda registrada en la bitácora.</p>"
        f"<form method=\"post\" action=\"/channels/action/{token}\">"
        f"<button type=\"submit\">{label}</button></form>"
    )
    return _PAGE.format(title=label, body=body)


def _render_done(action: str) -> str:
    msg = {
        "approve": "Gasto aprobado.",
        "reject": "Gasto rechazado.",
        "return": "Gasto devuelto al solicitante.",
    }.get(action, "Acción registrada.")
    body = f"<h1>Listo</h1><p>{msg}</p>"
    return _PAGE.format(title="Listo", body=body)


def _render_error(detail: str) -> str:
    body = f"<h1 class=\"err\">No se pudo procesar</h1><p>{detail}</p>"
    return _PAGE.format(title="Error", body=body)


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/{token}", response_class=HTMLResponse)
@limiter.limit(
    ACTION_LINK_RATE,
    key_func=lambda request: request.client.host if request.client else "anon",
)
def show_action(request: Request, token: str, db: Session = Depends(get_db)):
    try:
        claims, row = inspect_token(db, token)
    except ActionLinkError as exc:
        return HTMLResponse(_render_error(exc.detail), status_code=400)

    resource_summary = (
        f"{claims.resource_type} #{claims.resource_id}"
    )
    return HTMLResponse(_render_confirm(claims.action, resource_summary, token))


@router.post("/{token}", response_class=HTMLResponse)
@limiter.limit(
    ACTION_LINK_RATE,
    key_func=lambda request: request.client.host if request.client else "anon",
)
def perform_action(request: Request, token: str, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else None
    try:
        claims, _row = consume_token(db, token, ip=ip)
    except ActionLinkError as exc:
        return HTMLResponse(_render_error(exc.detail), status_code=400)

    try:
        _execute_action(db, claims)
    except Exception as exc:
        log.exception("action-link execution failed for token jti %s", claims.jti)
        log_event(
            db=db,
            entity_type=claims.resource_type,
            entity_id=claims.resource_id,
            action="action_link.failed",
            actor_user_id=claims.user_id,
            detail_text=f"action={claims.action} error={exc!s}",
            company_id=claims.company_id,
        )
        raise HTTPException(status_code=500, detail="Action failed") from exc

    log_event(
        db=db,
        entity_type=claims.resource_type,
        entity_id=claims.resource_id,
        action="action_link.consumed",
        actor_user_id=claims.user_id,
        detail_text=f"action={claims.action} ip={ip or 'unknown'}",
        company_id=claims.company_id,
    )
    return HTMLResponse(_render_done(claims.action))


# ── Action dispatch ──────────────────────────────────────────────────────────

def _execute_action(db: Session, claims) -> None:
    if claims.resource_type != "expense":
        raise ValueError(f"Unsupported resource_type: {claims.resource_type}")

    expense = (
        db.query(Expense)
        .filter(
            Expense.id == claims.resource_id,
            Expense.company_id == claims.company_id,
        )
        .first()
    )
    if expense is None:
        raise ValueError("expense not found")

    if claims.action == "approve":
        manager_approve_expense(db, expense, actor_user_id=claims.user_id)
    elif claims.action == "reject":
        manager_reject_expense(db, expense, actor_user_id=claims.user_id)
    elif claims.action == "return":
        manager_return_expense(db, expense, actor_user_id=claims.user_id)
    else:
        raise ValueError(f"Unsupported action: {claims.action}")
