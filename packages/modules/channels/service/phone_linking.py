"""WhatsApp phone linking service — identifies users by asking for their email.

When an unrecognized phone number sends a message, the system starts a
conversation flow:
  1. Bot asks "What's your email address?"
  2. User replies with their email
  3. System looks up the user by email in the company
  4. If found, links the phone number to the user account
  5. Confirms: "¡Listo! Tu teléfono está vinculado a maria@company.com"

This is much better UX than requiring admins to manually enter every phone number.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from packages.core.platform.models_user import User
from packages.modules.channels.models import ChannelConversation

_log = logging.getLogger(__name__)

# Email regex — simple but catches 99% of cases
_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")

# How long a linking conversation stays active
_LINK_EXPIRY = timedelta(minutes=15)


def get_or_create_conversation(
    db: Session,
    company_id: int,
    channel: str,
    sender_ref: str,
    thread_id: str,
) -> ChannelConversation | None:
    """Get an existing active conversation or return None."""
    conv = (
        db.query(ChannelConversation)
        .filter(
            ChannelConversation.company_id == company_id,
            ChannelConversation.channel == channel,
            ChannelConversation.thread_id == thread_id,
        )
        .order_by(ChannelConversation.created_at.desc())
        .first()
    )
    if conv and conv.expires_at and conv.expires_at > datetime.now(tz=timezone.utc):
        return conv
    return None


def start_linking_flow(
    db: Session,
    company_id: int,
    channel: str,
    sender_ref: str,
    thread_id: str,
) -> str:
    """Start the email-verification flow for an unrecognized phone number.
    
    Returns the message to send to the user.
    """
    # Expire any old conversations for this thread
    _expire_old_conversations(db, company_id, channel, thread_id)

    conv = ChannelConversation(
        company_id=company_id,
        channel=channel,
        thread_id=thread_id,
        sender_ref=sender_ref,
        state="awaiting_email",
        context_json='{"flow": "phone_linking"}',
        expires_at=datetime.now(tz=timezone.utc) + _LINK_EXPIRY,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)

    return (
        "¡Hola! 👋 No reconocí tu número de teléfono.\n\n"
        "Para vincular tu cuenta, por favor escribe tu **correo electrónico** "
        "de la empresa.\n\n"
        "Ejemplo: maria@miempresa.com"
    )


def process_linking_response(
    db: Session,
    company_id: int,
    channel: str,
    sender_ref: str,
    thread_id: str,
    message_body: str,
) -> dict[str, Any]:
    """Process a response in the phone linking flow.

    Returns dict with:
      - "linked": bool — whether the phone was successfully linked
      - "message": str — the message to send back to the user
      - "user_id": int | None — the linked user's ID
    """
    conv = get_or_create_conversation(db, company_id, channel, sender_ref, thread_id)

    if conv is None:
        # No active conversation — this shouldn't happen normally
        return {
            "linked": False,
            "message": "Tu sesión expiró. Envía un mensaje de nuevo para empezar.",
            "user_id": None,
        }

    if conv.state == "awaiting_email":
        # User is providing their email address
        email = _extract_email(message_body)
        if not email:
            return {
                "linked": False,
                "message": (
                    "No pude detectar un correo electrónico. "
                    "Por favor escribe solo tu correo, por ejemplo:\n"
                    "maria@miempresa.com"
                ),
                "user_id": None,
            }

        # Look up the user by email in this company
        user = (
            db.query(User)
            .filter(
                User.company_id == company_id,
                User.email == email.lower().strip(),
                User.is_active == True,  # noqa: E712
            )
            .first()
        )

        if user is None:
            _log.warning(
                "Phone linking: no user found for email=%s in company=%s",
                email, company_id,
            )
            return {
                "linked": False,
                "message": (
                    f"No encontré una cuenta con el correo **{email}**.\n\n"
                    "¿Es ese tu correo de la empresa? Intenta de nuevo o "
                    "contacta a tu administrador."
                ),
                "user_id": None,
            }

        # Check if this phone is already linked to another user
        phone = sender_ref
        existing = (
            db.query(User)
            .filter(
                User.whatsapp_phone == phone,
                User.id != user.id,
            )
            .first()
        )
        if existing:
            _log.warning(
                "Phone linking: phone=%s already linked to user=%s, attempting to link to user=%s",
                phone, existing.id, user.id,
            )
            return {
                "linked": False,
                "message": (
                    "Este número de teléfono ya está vinculado a otra cuenta "
                    f"({existing.email}).\n\n"
                    "Si crees que esto es un error, contacta a tu administrador."
                ),
                "user_id": None,
            }

        # Link the phone number to the user
        user.whatsapp_phone = phone
        user.whatsapp_verified = True
        user.whatsapp_verified_at = datetime.now(tz=timezone.utc)

        # Mark conversation as done
        conv.state = "verified"
        conv.user_id = user.id
        conv.expires_at = datetime.now(tz=timezone.utc) + timedelta(minutes=5)

        db.commit()
        db.refresh(user)

        _log.info(
            "Phone linked: user=%s (%s) → phone=%s",
            user.id, user.email, phone,
        )

        return {
            "linked": True,
            "message": (
                f"✅ ¡Listo! Tu teléfono está vinculado a **{user.email}**.\n\n"
                f"Hola **{user.full_name}** 👋 A partir de ahora puedes:\n"
                f"• 📸 Enviar fotos de recibos para crear gastos\n"
                f"• ✅ Aprobar o rechazar gastos pendientes\n"
                f"• ⏱️ Registrar horas en proyectos\n"
                f"• 📊 Consultar reportes de gastos\n\n"
                f"¿En qué te puedo ayudar?"
            ),
            "user_id": user.id,
        }

    return {
        "linked": False,
        "message": "Tu sesión expiró. Envía un mensaje de nuevo para empezar.",
        "user_id": None,
    }


def _extract_email(text: str) -> str | None:
    """Extract an email address from a message body."""
    text = text.strip().lower()
    # Try to find an email in the text
    matches = _EMAIL_RE.findall(text)
    if matches:
        return matches[0]
    # Also try extracting from within text
    words = text.replace(",", " ").replace(";", " ").replace("\n", " ").split()
    for word in words:
        word = word.strip()
        if _EMAIL_RE.match(word):
            return word
    return None


def _expire_old_conversations(
    db: Session,
    company_id: int,
    channel: str,
    thread_id: str,
) -> None:
    """Mark old conversations as expired."""
    now = datetime.now(tz=timezone.utc)
    old = (
        db.query(ChannelConversation)
        .filter(
            ChannelConversation.company_id == company_id,
            ChannelConversation.channel == channel,
            ChannelConversation.thread_id == thread_id,
        )
        .all()
    )
    for conv in old:
        conv.state = "expired"
    db.commit()
