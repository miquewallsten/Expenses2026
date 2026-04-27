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
<html lang=\"{lang}\">
<head>
  <meta charset=\"utf-8\">
  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">
  <meta name=\"theme-color\" content=\"#09090b\">
  <meta name=\"robots\" content=\"noindex,nofollow\">
  <title>{title}</title>
  <style>
    *{{box-sizing:border-box}}
    html,body{{margin:0;background:#09090b;color:#e4e4e7;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif;-webkit-font-smoothing:antialiased}}
    body{{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:max(16px,env(safe-area-inset-top)) 16px max(24px,env(safe-area-inset-bottom))}}
    .card{{background:#18181b;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:24px;max-width:440px;width:100%}}
    h1{{font-size:18px;line-height:1.3;margin:0 0 12px;font-weight:600;letter-spacing:-0.01em;color:#fafafa}}
    p{{font-size:14px;line-height:1.55;color:rgba(255,255,255,0.78);margin:0 0 12px}}
    .meta{{font-size:12px;color:rgba(255,255,255,0.55);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}}
    button{{appearance:none;width:100%;min-height:44px;background:#4f46e5;color:#fff;border:0;padding:12px 18px;border-radius:8px;font-weight:600;font-size:15px;cursor:pointer;margin-top:8px}}
    button:hover{{background:#4338ca}}
    button:active{{background:#3730a3}}
    .err{{color:#fca5a5}}
  </style>
</head>
<body><div class=\"card\">{body}</div></body>
</html>"""

_STR = {
    "es": {
        "approve": "Aprobar", "reject": "Rechazar", "return": "Devolver",
        "confirm_title": "Confirmar acción: {label}",
        "confirm_body": "Esta acción es definitiva y queda registrada en la bitácora.",
        "done_title": "Listo",
        "done_msg": {
            "approve": "Gasto aprobado.",
            "reject": "Gasto rechazado.",
            "return": "Gasto devuelto al solicitante.",
            "_default": "Acción registrada.",
        },
        "err_title": "No se pudo procesar",
        "err_page_title": "Error",
    },
    "en": {
        "approve": "Approve", "reject": "Reject", "return": "Return",
        "confirm_title": "Confirm action: {label}",
        "confirm_body": "This action is final and is recorded in the audit log.",
        "done_title": "Done",
        "done_msg": {
            "approve": "Expense approved.",
            "reject": "Expense rejected.",
            "return": "Expense returned to the submitter.",
            "_default": "Action recorded.",
        },
        "err_title": "Could not process",
        "err_page_title": "Error",
    },
}


def _pick_lang(request: Request) -> str:
    al = (request.headers.get("accept-language") or "").lower()
    # Default to Spanish (primary locale); switch to English only when EN is
    # clearly preferred and ES isn't in the list.
    if al.startswith("en") and "es" not in al:
        return "en"
    return "es"


def _render_confirm(lang: str, action: str, resource: str, token: str) -> str:
    s = _STR.get(lang, _STR["es"])
    label = s.get(action, action.title())
    body = (
        f"<h1>{s['confirm_title'].format(label=label)}</h1>"
        f"<p class=\"meta\">{resource}</p>"
        f"<p>{s['confirm_body']}</p>"
        f"<form method=\"post\" action=\"/channels/action/{token}\">"
        f"<button type=\"submit\">{label}</button></form>"
    )
    return _PAGE.format(lang=lang, title=label, body=body)


def _render_done(lang: str, action: str) -> str:
    s = _STR.get(lang, _STR["es"])
    msg = s["done_msg"].get(action, s["done_msg"]["_default"])
    body = f"<h1>{s['done_title']}</h1><p>{msg}</p>"
    return _PAGE.format(lang=lang, title=s["done_title"], body=body)


def _render_error(lang: str, detail: str) -> str:
    s = _STR.get(lang, _STR["es"])
    body = f"<h1 class=\"err\">{s['err_title']}</h1><p>{detail}</p>"
    return _PAGE.format(lang=lang, title=s["err_page_title"], body=body)


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/{token}", response_class=HTMLResponse)
@limiter.limit(
    ACTION_LINK_RATE,
    key_func=lambda request: request.client.host if request.client else "anon",
)
def show_action(request: Request, token: str, db: Session = Depends(get_db)):
    lang = _pick_lang(request)
    try:
        claims, row = inspect_token(db, token)
    except ActionLinkError as exc:
        return HTMLResponse(_render_error(lang, exc.detail), status_code=400)

    resource_summary = (
        f"{claims.resource_type} #{claims.resource_id}"
    )
    return HTMLResponse(_render_confirm(lang, claims.action, resource_summary, token))


@router.post("/{token}", response_class=HTMLResponse)
@limiter.limit(
    ACTION_LINK_RATE,
    key_func=lambda request: request.client.host if request.client else "anon",
)
def perform_action(request: Request, token: str, db: Session = Depends(get_db)):
    lang = _pick_lang(request)
    ip = request.client.host if request.client else None
    try:
        claims, _row = consume_token(db, token, ip=ip)
    except ActionLinkError as exc:
        return HTMLResponse(_render_error(lang, exc.detail), status_code=400)

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
    return HTMLResponse(_render_done(lang, claims.action))


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
