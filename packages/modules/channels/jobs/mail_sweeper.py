"""
IMAP Mail Sweeper — polls mailboxes for inbound expense emails.

Polls the platform-wide mailbox (PlatformSettings) plus per-company
mailboxes (ChannelSettings.email_imap_enabled). Each new message is
parsed into a NormalizedMessage and dispatched through the same
email_inbound pipeline that webhook-triggered messages use.

Designed to run as a background thread started from main.py lifecycle,
or via APScheduler cron job.
"""

from __future__ import annotations

import base64
import email
import email.header
import imaplib
import logging
import os
import re
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import TYPE_CHECKING

from packages.modules.channels.schemas import InboundAttachment, NormalizedMessage

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

_STORAGE_ROOT = Path(os.environ.get("STORAGE_ROOT", "storage"))
_POLL_INTERVAL = int(os.environ.get("IMAP_POLL_INTERVAL_SECONDS", "120"))


def _decode_header(raw: str) -> str:
    """Decode RFC 2047 encoded header values."""
    if not raw:
        return ""
    parts = email.header.decode_header(raw)
    decoded = []
    for part, charset in parts:
        if isinstance(part, bytes):
            decoded.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(part)
    return "".join(decoded)


def _extract_email_address(raw: str) -> str:
    if "<" in raw and ">" in raw:
        return raw.split("<")[1].split(">")[0].strip().lower()
    return raw.strip().lower()


class ImapConnection:
    """Context-manager IMAP connection."""

    def __init__(self, host: str, port: int, user: str, password: str):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.conn: imaplib.IMAP4_SSL | imaplib.IMAP4 | None = None

    def __enter__(self):
        if self.port == 993:
            self.conn = imaplib.IMAP4_SSL(self.host, self.port, timeout=30)
        else:
            self.conn = imaplib.IMAP4(self.host, self.port, timeout=30)
        self.conn.login(self.user, self.password)
        self.conn.select("INBOX")
        return self.conn

    def __exit__(self, *exc):
        try:
            if self.conn:
                self.conn.logout()
        except Exception:
            pass


def _fetch_new_messages(
    host: str,
    port: int,
    user: str,
    password: str,
    last_uid_file: Path | None = None,
) -> list[dict]:
    """Fetch unseen messages from an IMAP mailbox.

    If ``last_uid_file`` is provided, only messages with UID greater than
    the stored value are processed (persistent cursor).
    """
    messages: list[dict] = []
    last_uid = 0
    if last_uid_file and last_uid_file.exists():
        try:
            last_uid = int(last_uid_file.read_text().strip())
        except ValueError:
            last_uid = 0

    try:
        with ImapConnection(host, port, user, password) as conn:
            if last_uid > 0:
                # Fetch messages newer than last seen UID
                _, data = conn.uid("search", None, f"UID {last_uid + 1}:*")
            else:
                _, data = conn.uid("search", None, "UNSEEN")

            uids = data[0].split() if data[0] else []
            if not uids:
                return messages

            for uid_bytes in uids:
                uid_int = int(uid_bytes)
                _, msg_data = conn.uid("fetch", uid_bytes, "(RFC822)")
                if not msg_data or not msg_data[0]:
                    continue

                raw_email = msg_data[0][1]
                msg = email.message_from_bytes(raw_email)

                from_addr = _decode_header(msg.get("From", ""))
                to_addr = _decode_header(msg.get("To", ""))
                subject = _decode_header(msg.get("Subject", ""))
                message_id = msg.get("Message-ID", "") or from_addr
                date_str = msg.get("Date", "")

                body_text = ""
                attachments: list[InboundAttachment] = []

                if msg.is_multipart():
                    for part in msg.walk():
                        ct = part.get_content_type()
                        cd = part.get("Content-Disposition", "")
                        if "attachment" in cd or part.get_filename():
                            filename = part.get_filename() or "attachment"
                            filename = _decode_header(filename)
                            try:
                                payload = part.get_payload(decode=True)
                                if payload:
                                    attachments.append(InboundAttachment(
                                        filename=filename,
                                        content_type=ct,
                                        size_bytes=len(payload),
                                        content_b64=base64.b64encode(payload).decode("ascii"),
                                    ))
                            except Exception:
                                log.exception("Failed to decode attachment %s", filename)
                        elif ct == "text/plain" and not body_text:
                            try:
                                payload = part.get_payload(decode=True)
                                charset = part.get_content_charset() or "utf-8"
                                body_text = payload.decode(charset, errors="replace")
                            except Exception:
                                pass
                else:
                    try:
                        payload = msg.get_payload(decode=True)
                        charset = msg.get_content_charset() or "utf-8"
                        body_text = payload.decode(charset, errors="replace")
                    except Exception:
                        pass

                messages.append({
                    "uid": uid_int,
                    "from": from_addr,
                    "to": to_addr,
                    "subject": subject,
                    "message_id": message_id,
                    "date": date_str,
                    "body": body_text,
                    "attachments": attachments,
                })

            # Persist the last UID
            if last_uid_file and uids:
                max_uid = max(int(u) for u in uids)
                last_uid_file.parent.mkdir(parents=True, exist_ok=True)
                last_uid_file.write_text(str(max_uid))

    except Exception:
        log.exception("IMAP fetch failed for %s@%s", user, host)
        return messages

    return messages


def _process_inbox(
    db: "Session",
    host: str,
    port: int,
    user: str,
    password: str,
    company_id: int | None,
    mailbox_name: str,
) -> int:
    """Poll one IMAP inbox and dispatch each message through the channel pipeline."""
    last_uid_file = _STORAGE_ROOT / "imap-cursors" / f"{mailbox_name}.uid"
    messages = _fetch_new_messages(host, port, user, password, last_uid_file)
    if not messages:
        return 0

    from packages.modules.channels.models import ChannelSettings
    from packages.modules.agent.core.channel_dispatcher import CHANNEL_DISPATCHER

    processed = 0
    for msg_data in messages:
        try:
            to_addr = _extract_email_address(msg_data["to"])
            from_addr = _extract_email_address(msg_data["from"])

            # Resolve company
            cid = company_id
            if cid is None:
                # Try to resolve by inbound address
                rows = (
                    db.query(ChannelSettings)
                    .filter(ChannelSettings.channel == "email", ChannelSettings.is_enabled == True)
                    .all()
                )
                for s in rows:
                    if s.email_inbound_address and s.email_inbound_address.lower() in to_addr:
                        cid = s.company_id
                        break
                if cid is None:
                    log.warning("IMAP: No company for %s — dropped", to_addr)
                    continue

            norm = NormalizedMessage(
                channel="email",
                company_id=cid,
                sender_ref=from_addr,
                thread_id=msg_data["message_id"] or from_addr,
                body=(msg_data["body"] or "").strip(),
                attachments=msg_data["attachments"],
                raw=msg_data,
            )

            # Try CFDI draft creation
            try:
                from packages.modules.channels.service.inbound_drafts import try_create_draft_from_email
                try_create_draft_from_email(db, norm)
            except Exception:
                log.exception("IMAP: CFDI draft creation crashed")

            # Dispatch to agent
            CHANNEL_DISPATCHER.dispatch(
                db=db,
                channel_type="email",
                message=norm.body or "",
                user_id=norm.sender_ref,
                company_id=cid,
                confidence=1.0,
            )
            processed += 1

        except Exception:
            log.exception("IMAP: Error processing message from %s", msg_data.get("from", "?"))

    return processed


class MailboxAgent:
    """
    Background agent that polls IMAP mailboxes for new expense emails.

    Usage:
        agent = MailboxAgent(session_factory)
        agent.start()   # starts background thread
        agent.stop()    # graceful shutdown
    """

    def __init__(self, session_factory, poll_interval: int = _POLL_INTERVAL):
        self._session_factory = session_factory
        self._poll_interval = poll_interval
        self._running = False
        self._thread = None

    def start(self):
        """Start the background polling thread."""
        if self._running:
            return
        import threading
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True, name="imap-mailbox-agent")
        self._thread.start()
        log.info("MailboxAgent started (poll interval: %ss)", self._poll_interval)

    def stop(self):
        """Signal the background thread to stop and wait for it."""
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=10)
        log.info("MailboxAgent stopped")

    def _run_loop(self):
        """Main polling loop."""
        while self._running:
            try:
                self._poll_all()
            except Exception:
                log.exception("MailboxAgent poll cycle failed")
            time.sleep(self._poll_interval)

    def _poll_all(self):
        """Poll platform mailbox + all enabled tenant mailboxes."""
        from apps.api.deps import get_db
        from packages.core.platform.models_platform_settings import PlatformSettings

        db = next(self._session_factory())
        try:
            # 1. Platform-wide mailbox
            platform = db.query(PlatformSettings).first()
            if platform and platform.imap_enabled and platform.imap_host:
                _process_inbox(
                    db=db,
                    host=platform.imap_host,
                    port=platform.imap_port or 993,
                    user=platform.imap_user,
                    password=platform.imap_password,
                    company_id=None,  # resolved by inbound address
                    mailbox_name="platform",
                )

            # 2. Per-company mailboxes
            from packages.modules.channels.models import ChannelSettings
            rows = db.query(ChannelSettings).filter(
                ChannelSettings.channel == "email",
                ChannelSettings.email_imap_enabled == True,
            ).all()
            for cs in rows:
                if not cs.email_imap_host or not cs.email_imap_user:
                    continue
                _process_inbox(
                    db=db,
                    host=cs.email_imap_host,
                    port=cs.email_imap_port or 993,
                    user=cs.email_imap_user,
                    password=cs.email_imap_password,
                    company_id=cs.company_id,
                    mailbox_name=f"company_{cs.company_id}",
                )
        finally:
            try:
                db.close()
            except Exception:
                pass


# Singleton for import convenience
MAILBOX_AGENT = None


def start_mailbox_agent(session_factory=None):
    """Start the MailboxAgent if IMAP polling is enabled."""
    global MAILBOX_AGENT
    if not os.environ.get("IMAP_POLLING_ENABLED", "").lower() in ("1", "true", "yes"):
        log.info("IMAP_POLLING_ENABLED not set — skipping mailbox agent")
        return None

    if session_factory is None:
        from apps.api.deps import get_db
        session_factory = get_db

    MAILBOX_AGENT = MailboxAgent(session_factory)
    MAILBOX_AGENT.start()
    return MAILBOX_AGENT


def stop_mailbox_agent():
    """Stop the MailboxAgent if running."""
    global MAILBOX_AGENT
    if MAILBOX_AGENT:
        MAILBOX_AGENT.stop()
        MAILBOX_AGENT = None
