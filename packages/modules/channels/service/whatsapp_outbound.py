"""WhatsApp outbound reply service.

Sends structured messages back to users via WhatsApp after agent processing.
Formats expense confirmations, approval lists, time tracking confirmations,
and spend reports into WhatsApp-friendly messages.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from packages.modules.channels.models import ChannelSettings, ChannelMessage
from packages.modules.channels.service.whatsapp_client import send_text, send_template

log = logging.getLogger(__name__)


def _get_settings(db: Session, company_id: int) -> ChannelSettings | None:
    return (
        db.query(ChannelSettings)
        .filter(
            ChannelSettings.company_id == company_id,
            ChannelSettings.channel == "whatsapp",
            ChannelSettings.is_enabled == True,  # noqa: E712
        )
        .first()
    )


def send_whatsapp_reply(
    db: Session,
    company_id: int,
    phone: str,
    message: str,
    wa_message_id: str | None = None,
) -> bool:
    """Send a plain text reply to a WhatsApp user.

    Returns True on success, False on failure (settings not configured, API error).
    """
    settings = _get_settings(db, company_id)
    if not settings or not settings.wa_phone_number_id or not settings.wa_access_token:
        log.warning("WhatsApp not configured for company %s — cannot send reply", company_id)
        return False

    try:
        result = send_text(
            phone_number_id=settings.wa_phone_number_id,
            access_token=settings.wa_access_token,
            to=phone,
            body=message,
        )

        # Log outbound message
        msg = ChannelMessage(
            company_id=company_id,
            channel="whatsapp",
            direction="outbound",
            sender_ref=settings.wa_phone_number_id,
            thread_id=phone,
            body=message[:4000] if message else None,
            wa_message_id=result.get("messages", [{}])[0].get("id") if result else None,
            status="sent",
        )
        db.add(msg)
        db.commit()
        return True

    except Exception as exc:
        log.error("Failed to send WhatsApp reply to %s: %s", phone, exc)
        return False


def format_expense_confirmation(expense_data: dict) -> str:
    """Format a WhatsApp-friendly expense confirmation message."""
    lines = [
        f"✅ *Gasto creado*",
        f"#{expense_data.get('expense_id', '?')} — {expense_data.get('description', '')}",
        f"💰 ${expense_data.get('amount', 0):,.2f} {expense_data.get('currency', 'MXN')}",
        f"📊 Estado: {expense_data.get('status', 'draft')}",
    ]
    if expense_data.get('category_code'):
        lines.append(f"🏷️ Categoría: {expense_data['category_code']}")
    lines.append("")
    lines.append("Responde *enviar* para mandarlo a aprobación.")
    return "\n".join(lines)


def format_approval_list(pending: list[dict]) -> str:
    """Format a WhatsApp-friendly list of pending approvals."""
    if not pending:
        return "✅ No hay gastos pendientes de aprobación."

    lines = ["📋 *Gastos pendientes de aprobación:*"]
    for p in pending[:10]:  # WhatsApp message limit
        lines.append(
            f"• #{p.get('expense_id', '?')} — ${p.get('amount', 0):,.2f} "
            f"{p.get('description', '')[:40]}"
        )
    lines.append("")
    lines.append("Responde: *aprobar #ID* o *rechazar #ID motivo*")
    return "\n".join(lines)


def format_spend_summary(data: dict) -> str:
    """Format a WhatsApp-friendly spend summary."""
    lines = [
        f"📊 *Gastos {data.get('period', 'mes')}:*",
        f"💰 Total: ${data.get('total', 0):,.2f} MXN",
        f"📝 {data.get('count', 0)} gastos",
    ]
    by_cat = data.get("by_category", {})
    if by_cat:
        lines.append("")
        lines.append("*Por categoría:*")
        for cat, info in sorted(by_cat.items(), key=lambda x: -x[1]["total"])[:5]:
            lines.append(f"  • {cat}: ${info['total']:,.2f} ({info['count']})")
    return "\n".join(lines)


def format_time_entry_confirmation(data: dict) -> str:
    """Format a WhatsApp-friendly time entry confirmation."""
    lines = [
        f"⏱️ *Horas registradas*",
        f"📋 {data.get('hours', 0)}h en {data.get('project', '?')}",
        f"📅 {data.get('date', '?')}",
        f"Estado: {data.get('status', 'draft')}",
    ]
    lines.append("")
    lines.append("Responde *enviar semana* cuando termines.")
    return "\n".join(lines)
