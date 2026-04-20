"""
Channel Gateway Agent — the brain of the inbound channel system.

Responsibilities
----------------
1. Receive a NormalizedMessage from any channel adapter.
2. Resolve the sender to a platform User (or start a verification flow).
3. Classify intent via the local Ollama LLM.
4. Execute the appropriate action (create expense draft, look up status, etc.).
5. Return a plain-text reply that the adapter sends back through the channel.

Intent taxonomy
---------------
expense_submission   — Message has invoice/receipt attachments
approval_action      — "approve" / "reject" / "apruebo" etc. from a manager
status_inquiry       — "what's the status of my expense?"
report_query         — "how much did we spend on X last month?"
verification_code    — User is replying with the 6-digit OTP
greeting             — First contact or casual hello
unknown              — Can't classify; ask for clarification

State machine (per ChannelConversation)
---------------------------------------
awaiting_email   → user sends their email
awaiting_code    → verification OTP sent to that email; waiting for user reply
verified         → user is identified; normal operations
awaiting_project → expense draft created but project is required; waiting for reply
"""

from __future__ import annotations

import hashlib
import logging
import os
import random
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from apps.api.ai.ollama_client import chat_with_ollama
from packages.modules.channels.models import (
    ChannelConversation,
    ChannelMessage,
    ChannelSettings,
    ChannelVerification,
)
from packages.modules.channels.schemas import NormalizedMessage

log = logging.getLogger(__name__)

# Maximum failed OTP attempts before expiry
_MAX_CODE_ATTEMPTS = 3
# Verification OTP validity window
_CODE_TTL_MINUTES = 15
# Conversation session TTL for unverified threads
_CONV_TTL_HOURS = 2

# ── Helpers ───────────────────────────────────────────────────────────────────


def _hash_code(code: str) -> str:
    """SHA-256 hash of the code (fast; fine for short-lived OTPs)."""
    return hashlib.sha256(code.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _send_reply(db: Session, msg: NormalizedMessage, settings: ChannelSettings, body: str) -> None:
    """Dispatch an outbound reply through the correct channel."""
    if msg.channel == "whatsapp":
        _send_whatsapp_reply(settings, msg.sender_ref, body)
    elif msg.channel == "email":
        _send_email_reply(settings, msg.sender_ref, body, msg.thread_id)

    # Log outbound
    db.add(ChannelMessage(
        company_id=msg.company_id,
        channel=msg.channel,
        direction="outbound",
        sender_ref=msg.sender_ref,
        thread_id=msg.thread_id,
        body=body,
        status="replied",
    ))
    db.commit()


def _send_whatsapp_reply(settings: ChannelSettings, to: str, body: str) -> None:
    from packages.modules.channels.service.whatsapp_client import send_text
    if not settings.wa_phone_number_id or not settings.wa_access_token:
        log.warning("WhatsApp reply skipped — credentials not configured")
        return
    try:
        send_text(settings.wa_phone_number_id, settings.wa_access_token, to, body)
    except Exception as exc:
        log.error("WhatsApp reply failed: %s", exc)


def _send_email_reply(settings: ChannelSettings, to: str, body: str, thread_id: str) -> None:
    """Send a plain-text email reply using the channel SMTP config."""
    import smtplib
    from email.mime.text import MIMEText

    if not settings.email_smtp_host or not settings.email_smtp_from:
        log.warning("Email reply skipped — SMTP not configured")
        return
    try:
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = "Re: Your expense submission"
        msg["From"] = settings.email_smtp_from
        msg["To"] = to
        if thread_id:
            msg["In-Reply-To"] = thread_id
            msg["References"] = thread_id

        port = settings.email_smtp_port or 587
        with smtplib.SMTP(settings.email_smtp_host, port, timeout=10) as smtp:
            smtp.ehlo()
            smtp.starttls()
            if settings.email_smtp_user and settings.email_smtp_password:
                smtp.login(settings.email_smtp_user, settings.email_smtp_password)
            smtp.sendmail(settings.email_smtp_from, [to], msg.as_string())
    except Exception as exc:
        log.error("Email reply failed to %s: %s", to, exc)


# ── Intent classification ─────────────────────────────────────────────────────

_INTENT_SYSTEM = """
You are an intent classifier for a business expense management platform.
Classify the user's message into exactly ONE of these intents:
  expense_submission  — the user is submitting an expense (mentions invoice, receipt, factura, gasto, comprobante, or has attachments)
  approval_action     — the user is approving or rejecting something (approve, reject, apruebo, rechazo, autorizo)
  status_inquiry      — asking about the status of an expense or report
  report_query        — asking for a financial summary or report (total, spent, gastamos, cuánto, resumen, reporte)
  verification_code   — the message appears to be a 6-digit numeric code
  greeting            — hello, hi, hola, good morning, or similar greeting with no clear business intent
  unknown             — cannot determine intent

Reply with ONLY the intent key, nothing else.
""".strip()


def _classify_intent(body: str, has_attachments: bool) -> str:
    """Use the local LLM to classify message intent."""
    if has_attachments:
        return "expense_submission"
    # Fast regex shortcuts before hitting the LLM
    if re.match(r"^\s*\d{6}\s*$", body.strip()):
        return "verification_code"
    result = chat_with_ollama(_INTENT_SYSTEM, body[:500])
    if result.get("ok"):
        raw = result.get("content", "").strip().lower()
        for key in ("expense_submission", "approval_action", "status_inquiry",
                    "report_query", "verification_code", "greeting", "unknown"):
            if key in raw:
                return key
    return "unknown"


# ── Verification flow ─────────────────────────────────────────────────────────

def _start_verification(
    db: Session,
    msg: NormalizedMessage,
    settings: ChannelSettings,
    conv: ChannelConversation,
    email: str,
) -> str:
    """Look up user by email, create OTP, send it, return reply text."""
    from packages.core.platform.models_user import User  # avoid circular import

    user = db.query(User).filter(
        User.company_id == msg.company_id,
        User.email == email.lower().strip(),
        User.is_active == True,
    ).first()

    if not user:
        return (
            "That email address isn't registered in our system. "
            "Please contact your administrator or try a different email address."
        )

    # Generate 6-digit code
    code = f"{random.SystemRandom().randint(0, 999999):06d}"
    code_hash = _hash_code(code)

    db.add(ChannelVerification(
        user_id=user.id,
        channel=msg.channel,
        recipient_ref=msg.sender_ref,
        code_hash=code_hash,
        expires_at=_now() + timedelta(minutes=_CODE_TTL_MINUTES),
    ))

    # Send code to the email address (not back through the channel)
    _dispatch_otp_email(settings, email, code)

    # Advance conversation state
    conv.state = "awaiting_code"
    ctx = conv.get_context()
    ctx["pending_user_id"] = user.id
    ctx["pending_email"] = email.lower().strip()
    conv.set_context(ctx)
    db.commit()

    return (
        f"We sent a 6-digit verification code to {email}. "
        "Please reply with that code to confirm your identity."
    )


def _dispatch_otp_email(settings: ChannelSettings, to_email: str, code: str) -> None:
    """Send the OTP via email."""
    import smtplib
    from email.mime.text import MIMEText

    body = (
        f"Your verification code is: {code}\n\n"
        "This code expires in 15 minutes. Do not share it with anyone."
    )

    # Try channel SMTP first; fall back to the global SMTP env vars
    smtp_host = settings.email_smtp_host or os.environ.get("SMTP_HOST", "")
    smtp_port = settings.email_smtp_port or int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = settings.email_smtp_user or os.environ.get("SMTP_USER", "")
    smtp_pass = settings.email_smtp_password or os.environ.get("SMTP_PASSWORD", "")
    smtp_from = settings.email_smtp_from or os.environ.get("SMTP_FROM", "noreply@financial-ops.local")

    if not smtp_host:
        log.info("OTP for %s: %s (SMTP not configured — dev mode)", to_email, code)
        return

    try:
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = "Your verification code"
        msg["From"] = smtp_from
        msg["To"] = to_email
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as smtp:
            smtp.ehlo()
            smtp.starttls()
            if smtp_user and smtp_pass:
                smtp.login(smtp_user, smtp_pass)
            smtp.sendmail(smtp_from, [to_email], msg.as_string())
    except Exception as exc:
        log.error("OTP email dispatch failed to %s: %s", to_email, exc)


def _verify_code(
    db: Session,
    msg: NormalizedMessage,
    conv: ChannelConversation,
    code_text: str,
) -> str:
    """Validate the OTP and advance conversation to verified state."""
    from packages.core.platform.models_user import User

    ctx = conv.get_context()
    user_id = ctx.get("pending_user_id")
    if not user_id:
        conv.state = "awaiting_email"
        db.commit()
        return "Session expired. Please start over by sending your email address."

    code_text = code_text.strip()
    code_hash = _hash_code(code_text)

    verification = (
        db.query(ChannelVerification)
        .filter(
            ChannelVerification.user_id == user_id,
            ChannelVerification.channel == msg.channel,
            ChannelVerification.recipient_ref == msg.sender_ref,
            ChannelVerification.used_at == None,  # noqa: E711
            ChannelVerification.expires_at > _now(),
        )
        .order_by(ChannelVerification.created_at.desc())
        .first()
    )

    if not verification:
        conv.state = "awaiting_email"
        db.commit()
        return "Verification code has expired. Please send your email address again to restart."

    verification.attempts += 1

    if verification.attempts > _MAX_CODE_ATTEMPTS:
        db.commit()
        return "Too many incorrect attempts. Please send your email address to get a new code."

    if verification.code_hash != code_hash:
        db.commit()
        remaining = _MAX_CODE_ATTEMPTS - verification.attempts
        return f"Incorrect code. {remaining} attempt(s) remaining."

    # ✅ Correct code
    verification.used_at = _now()
    conv.user_id = user_id
    conv.state = "verified"

    # Persist WhatsApp phone on the user record
    if msg.channel == "whatsapp":
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.whatsapp_phone = msg.sender_ref
            user.whatsapp_verified = True
            user.whatsapp_verified_at = _now()

    db.commit()

    user = db.query(User).filter(User.id == user_id).first()
    name = user.full_name.split()[0] if user and user.full_name else "there"
    return (
        f"Identity confirmed. Welcome, {name}! "
        "You can now send expense photos or documents, ask about expense statuses, or request reports. "
        "What can I help you with today?"
    )


# ── Intent handlers ────────────────────────────────────────────────────────────

def _handle_expense_submission(
    db: Session,
    msg: NormalizedMessage,
    user_id: int,
) -> str:
    """
    Create a draft expense from attachment(s) and prompt for missing info.
    Real OCR/extraction happens in the existing document_triage module — we
    create a minimal expense record here and let the platform's existing
    validation pipeline handle the rest.
    """
    from packages.modules.expenses.models import Expense
    from packages.core.platform.models_user import User

    user = db.query(User).filter(User.id == user_id).first()
    attachment_count = len(msg.attachments)

    if attachment_count == 0:
        return (
            "Please attach the invoice or receipt image/PDF to your message "
            "and send it again."
        )

    # Create minimal draft expense(s) — one per attachment
    # Store channel/attachment context in notes for the triage pipeline to pick up.
    import json as json_mod
    created = []
    for att in msg.attachments:
        expense = Expense(
            company_id=msg.company_id,
            status="draft",
            description=f"Via {msg.channel} — pending review",
            amount=0,
            notes=json_mod.dumps({
                "submitted_by_user_id": user_id,
                "channel": msg.channel,
                "media_id": att.media_id,
                "filename": att.filename,
                "content_type": att.content_type,
            }),
        )
        db.add(expense)
        created.append(expense)

    try:
        db.flush()
        db.commit()
    except Exception as exc:
        log.error("Failed to create draft expense: %s", exc)
        db.rollback()
        return "There was an error creating the expense record. Please try again or use the app."

    count_str = f"{len(created)} expense(s)" if len(created) > 1 else "your expense"
    return (
        f"Received {attachment_count} document(s). I've created a draft for {count_str}. "
        "Our team will process and validate it. "
        "You'll receive a notification once it's reviewed. "
        "Is there a project or cost center you'd like to assign this to?"
    )


def _handle_status_inquiry(
    db: Session,
    msg: NormalizedMessage,
    user_id: int,
) -> str:
    """Return a brief status summary of recent pending expenses submitted from this channel."""
    from packages.modules.expenses.models import Expense
    import json as json_mod

    # Expenses submitted via channel store user_id in notes JSON.
    # Fetch recent drafts for this company and filter by submitted_by_user_id.
    candidates = (
        db.query(Expense)
        .filter(
            Expense.company_id == msg.company_id,
            Expense.status.in_(["draft", "submitted", "pending_review"]),
            Expense.notes.isnot(None),
        )
        .order_by(Expense.created_at.desc())
        .limit(50)
        .all()
    )

    recent = []
    for e in candidates:
        try:
            meta = json_mod.loads(e.notes or "{}")
            if meta.get("submitted_by_user_id") == user_id:
                recent.append(e)
                if len(recent) >= 5:
                    break
        except Exception:
            pass

    if not recent:
        return "You have no pending expenses at the moment. All expenses are processed or there are none on file."

    lines = []
    for e in recent:
        amt = f"{e.currency or ''} {e.amount or 0:.2f}".strip()
        lines.append(f"• #{e.id} — {e.description or 'No description'} ({amt}) — Status: {e.status}")

    return "Your recent pending expenses:\n" + "\n".join(lines)


def _handle_report_query(
    db: Session,
    msg: NormalizedMessage,
    user_id: int,
) -> str:
    """Use the LLM to generate a plain-language summary from the user's query."""
    from packages.modules.expenses.models import Expense
    from sqlalchemy import func as sa_func

    # Build context: total submitted last 30 days for this company
    # (user_id is not a direct column — use company-wide totals for report queries)
    from datetime import timedelta
    cutoff = _now() - timedelta(days=30)
    total = (
        db.query(sa_func.coalesce(sa_func.sum(Expense.amount), 0))
        .filter(Expense.company_id == msg.company_id, Expense.created_at >= cutoff)
        .scalar()
    )
    count = (
        db.query(sa_func.count(Expense.id))
        .filter(Expense.company_id == msg.company_id, Expense.created_at >= cutoff)
        .scalar()
    )

    context = f"User has {count} expenses totalling {total:.2f} in the last 30 days."
    system = (
        "You are a financial operations assistant. Answer the user's question using the provided context. "
        "Be concise. No markdown."
    )
    user_prompt = f"Context: {context}\n\nUser question: {msg.body[:400]}"
    result = chat_with_ollama(system, user_prompt)
    if result.get("ok"):
        return result["content"].strip()
    return f"In the last 30 days: {count} expenses submitted, total {total:.2f}."


def _handle_approval_action(
    db: Session,
    msg: NormalizedMessage,
    user_id: int,
) -> str:
    """
    Route approval/rejection actions.
    For now: acknowledge and direct manager to use the app for compliance reasons.
    Future: parse expense ID from context and trigger approve/reject workflow.
    """
    return (
        "To approve or reject an expense, please use the Manager portal in the app "
        "to ensure a proper audit trail. "
        "Direct approvals via WhatsApp/email are not yet supported for compliance reasons."
    )


# ── Main gateway entry point ───────────────────────────────────────────────────

def process_message(db: Session, msg: NormalizedMessage) -> str:
    """
    Main entry point called by channel adapters.

    Returns the reply text to send back through the same channel.
    All DB writes happen here; adapters only handle transport.
    """
    # ── Load channel settings ─────────────────────────────────────────────────
    settings = (
        db.query(ChannelSettings)
        .filter(ChannelSettings.company_id == msg.company_id, ChannelSettings.channel == msg.channel)
        .first()
    )
    if not settings or not settings.is_enabled:
        return ""  # Channel disabled — silently ignore

    # ── Deduplicate (WhatsApp can deliver webhooks more than once) ────────────
    if msg.wa_message_id:
        existing = db.query(ChannelMessage).filter(
            ChannelMessage.wa_message_id == msg.wa_message_id
        ).first()
        if existing:
            log.info("Duplicate webhook message %s — skipping", msg.wa_message_id)
            return ""

    # ── Log inbound ───────────────────────────────────────────────────────────
    import json as json_mod
    inbound_log = ChannelMessage(
        company_id=msg.company_id,
        channel=msg.channel,
        direction="inbound",
        sender_ref=msg.sender_ref,
        thread_id=msg.thread_id,
        wa_message_id=msg.wa_message_id,
        body=msg.body,
        attachments_json=json_mod.dumps([a.model_dump() for a in msg.attachments]) if msg.attachments else None,
        status="processing",
    )
    db.add(inbound_log)
    db.flush()

    # ── Get or create conversation ────────────────────────────────────────────
    conv = (
        db.query(ChannelConversation)
        .filter(
            ChannelConversation.company_id == msg.company_id,
            ChannelConversation.channel == msg.channel,
            ChannelConversation.thread_id == msg.thread_id,
            ChannelConversation.expires_at > _now(),
        )
        .order_by(ChannelConversation.created_at.desc())
        .first()
    )

    if not conv:
        conv = ChannelConversation(
            company_id=msg.company_id,
            channel=msg.channel,
            thread_id=msg.thread_id,
            sender_ref=msg.sender_ref,
            state="awaiting_email",
            expires_at=_now() + timedelta(hours=_CONV_TTL_HOURS),
        )
        db.add(conv)
        db.flush()

    # ── State machine ─────────────────────────────────────────────────────────
    reply: str

    if conv.state in ("awaiting_email",):
        # Check if the incoming message contains an email address
        email_match = re.search(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", msg.body or "")
        if email_match:
            reply = _start_verification(db, msg, settings, conv, email_match.group(0))
        else:
            reply = (
                "Welcome to the Financial Operations platform. "
                "To get started, please reply with your registered email address."
            )

    elif conv.state == "awaiting_code":
        # Check for 6-digit code in message body
        code_match = re.search(r"\b(\d{6})\b", msg.body or "")
        if code_match:
            reply = _verify_code(db, msg, conv, code_match.group(1))
        else:
            reply = (
                "Please reply with the 6-digit code we sent to your email address. "
                "If you didn't receive it, type your email address to resend."
            )

    elif conv.state == "verified" and conv.user_id:
        # Fully identified user — classify intent and act
        intent = _classify_intent(msg.body or "", bool(msg.attachments))
        inbound_log.intent = intent

        if intent == "expense_submission":
            reply = _handle_expense_submission(db, msg, conv.user_id)
        elif intent == "status_inquiry":
            reply = _handle_status_inquiry(db, msg, conv.user_id)
        elif intent == "report_query":
            reply = _handle_report_query(db, msg, conv.user_id)
        elif intent == "approval_action":
            reply = _handle_approval_action(db, msg, conv.user_id)
        elif intent == "greeting":
            from packages.core.platform.models_user import User
            user = db.query(User).filter(User.id == conv.user_id).first()
            name = user.full_name.split()[0] if user and user.full_name else "there"
            reply = (
                f"Hello {name}! I can help you with expense submissions, status updates, "
                "and spending reports. What do you need?"
            )
        else:
            reply = (
                "I didn't understand that. You can:\n"
                "• Send an invoice/receipt photo to submit an expense\n"
                '• Ask "what\'s the status of my expenses?"\n'
                '• Ask "how much did I spend last month?"'
            )
    else:
        # Fallback — reset
        conv.state = "awaiting_email"
        db.commit()
        reply = (
            "Your session has expired. "
            "Please reply with your registered email address to continue."
        )

    # ── Update log status and send reply ─────────────────────────────────────
    inbound_log.status = "replied" if reply else "ignored"
    db.commit()

    if reply:
        _send_reply(db, msg, settings, reply)

    return reply
