"""
Platform and Tenant Mailbox Watcher Service.

Implements the background loop for sweeping corporate and tenant mailboxes
via IMAP4_SSL. Extracts attachments (XML/PDF) and routes them through the
channel event_router → agent pipeline for expense creation.

Config:
    Platform: PlatformSettings.imap_* fields
    Per-tenant: ChannelSettings.email_imap_* fields
"""

from __future__ import annotations

import email
import imaplib
import logging
import asyncio
import os
import tempfile
from datetime import datetime, timezone
from email.header import decode_header
from email.utils import parseaddr
from typing import Any, List, Optional

from sqlalchemy.orm import Session

from apps.api.db import SessionLocal
from packages.core.platform.models_platform_settings import PlatformSettings
from packages.modules.channels.models import ChannelSettings, ChannelMessage

_log = logging.getLogger(__name__)

# IMAP search criteria — only unread messages
_UNREAD_CRITERIA = "(UNSEEN)"


def _decode_header_value(raw: str | None) -> str:
    """Decode RFC 2047 encoded header values."""
    if not raw:
        return ""
    parts = decode_header(raw)
    decoded_parts = []
    for part, charset in parts:
        if isinstance(part, bytes):
            decoded_parts.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            decoded_parts.append(part)
    return "".join(decoded_parts)


def _extract_attachments(msg: email.message.Message) -> list[dict[str, Any]]:
    """Extract all attachments from an email message.

    Returns list of dicts with keys: filename, content_type, data (bytes).
    """
    attachments = []
    for part in msg.walk():
        content_disposition = str(part.get("Content-Disposition", ""))
        if "attachment" not in content_disposition:
            continue
        filename = part.get_filename()
        if filename:
            filename = _decode_header_value(filename)
            data = part.get_payload(decode=True)
            if data:
                content_type = part.get_content_type() or "application/octet-stream"
                attachments.append({
                    "filename": filename,
                    "content_type": content_type,
                    "data": data,
                })
    return attachments


class ImapConnection:
    """Manages an IMAP4_SSL connection with retry logic."""

    def __init__(self, host: str, port: int, user: str, password: str):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.conn: imaplib.IMAP4_SSL | None = None

    def connect(self) -> imaplib.IMAP4_SSL:
        """Connect and authenticate to the IMAP server."""
        conn = imaplib.IMAP4_SSL(self.host, self.port)
        conn.login(self.user, self.password)
        conn.select("INBOX")
        self.conn = conn
        return conn

    def disconnect(self) -> None:
        """Close and logout from the IMAP server."""
        if self.conn:
            try:
                self.conn.close()
                self.conn.logout()
            except Exception:
                pass
            self.conn = None

    def fetch_unread(self) -> list[dict[str, Any]]:
        """Fetch all unread messages and return parsed results.

        Returns list of dicts with keys: message_id, from_addr, subject,
        date, body_text, attachments.
        """
        if not self.conn:
            self.connect()

        results = []
        try:
            status, message_ids = self.conn.search(None, _UNREAD_CRITERIA)
            if status != "OK":
                return results

            id_list = message_ids[0].split()
            for mid in id_list:
                try:
                    msg_data = self._fetch_and_parse(mid)
                    if msg_data:
                        results.append(msg_data)
                except Exception as exc:
                    _log.warning("Failed to parse IMAP message %s: %s", mid, exc)

        except Exception as exc:
            _log.error("IMAP search failed for %s: %s", self.user, exc)

        return results

    def _fetch_and_parse(self, msg_id: bytes) -> dict[str, Any] | None:
        """Fetch a single message by ID and parse it."""
        status, data = self.conn.fetch(msg_id, "(RFC822)")
        if status != "OK":
            return None

        raw_email = data[0][1]
        msg = email.message_from_bytes(raw_email)

        # Extract headers
        from_addr = parseaddr(msg.get("From", ""))[1]
        subject = _decode_header_value(msg.get("Subject", ""))
        message_id = msg.get("Message-ID", "")
        date_str = msg.get("Date", "")

        # Extract body text
        body_text = ""
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                if content_type == "text/plain":
                    payload = part.get_payload(decode=True)
                    if payload:
                        charset = part.get_content_charset() or "utf-8"
                        body_text = payload.decode(charset, errors="replace")
                        break
        else:
            payload = msg.get_payload(decode=True)
            if payload:
                charset = msg.get_content_charset() or "utf-8"
                body_text = payload.decode(charset, errors="replace")

        attachments = _extract_attachments(msg)

        # Mark as seen (IMAP \Seen flag)
        try:
            self.conn.store(msg_id, "+FLAGS", "\\Seen")
        except Exception:
            pass

        return {
            "message_id": message_id,
            "from_addr": from_addr,
            "subject": subject,
            "date": date_str,
            "body_text": body_text,
            "attachments": attachments,
        }


class MailboxAgent:
    """Background worker for IMAP ingestion.

    Sweeps platform and tenant mailboxes on a configurable interval,
    extracts attachments, and routes them through the channel pipeline
    for expense creation.
    """

    def __init__(self, poll_interval: int = 300):
        self.poll_interval = poll_interval
        self._running = False

    async def run_forever(self) -> None:
        """Main loop — polls mailboxes every poll_interval seconds."""
        self._running = True
        while self._running:
            try:
                db = SessionLocal()
                try:
                    await self.process_platform_mailbox(db)
                    await self.process_tenant_mailboxes(db)
                finally:
                    db.close()
            except Exception as exc:
                _log.error("Mailbox Agent Error: %s", exc)

            await asyncio.sleep(self.poll_interval)

    def stop(self) -> None:
        """Signal the loop to stop."""
        self._running = False

    async def process_platform_mailbox(self, db: Session) -> None:
        """Process the master corporate mailbox for platform-level tickets."""
        settings = db.query(PlatformSettings).first()
        if not settings or not getattr(settings, "imap_enabled", False):
            return

        imap_host = getattr(settings, "imap_host", None)
        imap_port = getattr(settings, "imap_port", 993)
        imap_user = getattr(settings, "imap_user", None)
        imap_pass = getattr(settings, "imap_password", None)

        if not all([imap_host, imap_user, imap_pass]):
            return

        _log.info("Sweeping Master Corporate Mailbox: %s", imap_user)
        conn = ImapConnection(imap_host, imap_port, imap_user, imap_pass)
        try:
            conn.connect()
            messages = conn.fetch_unread()
            for msg in messages:
                await self._route_platform_message(db, msg)
        except Exception as exc:
            _log.error("Platform mailbox error: %s", exc)
        finally:
            conn.disconnect()

    async def process_tenant_mailboxes(self, db: Session) -> None:
        """Process all enabled tenant mailboxes."""
        tenants = db.query(ChannelSettings).filter_by(
            channel="email", is_enabled=True, email_imap_enabled=True,
        ).all()

        for tenant in tenants:
            if not all([tenant.email_imap_host, tenant.email_imap_user, tenant.email_imap_password]):
                continue

            _log.info(
                "Sweeping Tenant Mailbox (Company %s): %s",
                tenant.company_id, tenant.email_imap_user,
            )
            conn = ImapConnection(
                tenant.email_imap_host,
                tenant.email_imap_port or 993,
                tenant.email_imap_user,
                tenant.email_imap_password,
            )
            try:
                conn.connect()
                messages = conn.fetch_unread()
                for msg in messages:
                    await self._route_tenant_message(db, tenant, msg)
            except Exception as exc:
                _log.error(
                    "Tenant mailbox error (company=%s): %s",
                    tenant.company_id, exc,
                )
            finally:
                conn.disconnect()

    async def _route_platform_message(self, db: Session, msg: dict) -> None:
        """Route a platform-level message to the event pipeline."""
        _log.info(
            "Platform message from %s: %s",
            msg.get("from_addr", "?"), msg.get("subject", "(no subject)"),
        )
        # Platform messages are support tickets — log them for now
        # Future: route to ticketing system
        try:
            channel_msg = ChannelMessage(
                company_id=0,  # Platform-level
                channel="email",
                direction="inbound",
                sender_ref=msg.get("from_addr", ""),
                content_text=msg.get("body_text", "")[:4000],
                content_json=None,
                status="received",
            )
            db.add(channel_msg)
            db.commit()
        except Exception as exc:
            _log.warning("Failed to log platform message: %s", exc)

    async def _route_tenant_message(self, db: Session, tenant: ChannelSettings, msg: dict) -> None:
        """Route a tenant message through the channel → agent pipeline.

        For expense-related emails (attachments with XML/PDF), creates a
        draft expense via the channel agent service.
        """
        from packages.modules.channels.service.agent import process_message

        _log.info(
            "Tenant message (company=%s) from %s: %s (%d attachments)",
            tenant.company_id,
            msg.get("from_addr", "?"),
            msg.get("subject", "(no subject)"),
            len(msg.get("attachments", [])),
        )

        # Save the inbound message to channel_messages
        try:
            channel_msg = ChannelMessage(
                company_id=tenant.company_id,
                channel="email",
                direction="inbound",
                sender_ref=msg.get("from_addr", ""),
                content_text=msg.get("body_text", "")[:4000],
                content_json=None,
                status="received",
            )
            db.add(channel_msg)
            db.commit()
        except Exception as exc:
            _log.warning("Failed to log tenant message: %s", exc)

        # If the email has XML/PDF attachments, route to agent for expense creation
        attachments = msg.get("attachments", [])
        xml_pdf_attachments = [
            a for a in attachments
            if a.get("filename", "").lower().endswith((".xml", ".pdf"))
        ]

        if xml_pdf_attachments:
            try:
                # Save attachments to temp files and process
                with tempfile.TemporaryDirectory() as tmp_dir:
                    file_paths = []
                    for att in xml_pdf_attachments:
                        fpath = os.path.join(tmp_dir, att["filename"])
                        with open(fpath, "wb") as f:
                            f.write(att["data"])
                        file_paths.append(fpath)

                    # Route through the channel agent
                    result = process_message(
                        db=db,
                        company_id=tenant.company_id,
                        channel="email",
                        sender_ref=msg.get("from_addr", ""),
                        text=msg.get("body_text", "")[:2000],
                        attachments=file_paths,
                    )
                    _log.info(
                        "Channel agent result for email from %s: ok=%s",
                        msg.get("from_addr"), result.get("ok"),
                    )
            except Exception as exc:
                _log.error(
                    "Failed to route email attachments (company=%s): %s",
                    tenant.company_id, exc,
                )
