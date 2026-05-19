"""Notification delivery service.

Takes notifications from the DB and delivers them via email (SMTP) and
push (WebSocket). Designed to be called from a background worker or
the notification API endpoints.
"""
from __future__ import annotations

import logging
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from packages.modules.agent.models_notification import Notification, NotificationRead

log = logging.getLogger(__name__)


class NotificationDeliveryService:
    """Delivers notifications via email and push channels."""

    def __init__(self):
        self._smtp_host = os.getenv("SMTP_HOST", "")
        self._smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self._smtp_user = os.getenv("SMTP_USER", "")
        self._smtp_pass = os.getenv("SMTP_PASS", "")
        self._from_addr = os.getenv("NOTIFICATION_FROM_EMAIL", "noreply@financialops.app")

    # ── Email delivery ────────────────────────────────────────────────────────

    def send_email(
        self,
        to_addr: str,
        subject: str,
        body_html: str,
        body_text: str | None = None,
    ) -> bool:
        """Send an email notification. Returns True on success."""
        if not self._smtp_host:
            log.debug("SMTP not configured, skipping email to %s", to_addr)
            return False

        try:
            msg = MIMEMultipart("alternative")
            msg["From"] = self._from_addr
            msg["To"] = to_addr
            msg["Subject"] = subject

            if body_text:
                msg.attach(MIMEText(body_text, "plain", "utf-8"))
            msg.attach(MIMEText(body_html, "html", "utf-8"))

            with smtplib.SMTP(self._smtp_host, self._smtp_port) as server:
                if self._smtp_user:
                    server.starttls()
                    server.login(self._smtp_user, self._smtp_pass)
                server.send_message(msg)

            log.info("Email sent to %s: %s", to_addr, subject)
            return True
        except Exception as exc:
            log.warning("Failed to send email to %s: %s", to_addr, exc)
            return False

    def send_notification_email(
        self,
        db: Session,
        notification: Notification,
        user_email: str,
        user_name: str | None = None,
    ) -> bool:
        """Format and send a notification as email to a user."""
        subject = notification.title or "Financial Ops Notification"
        greeting = f"Hola {user_name or 'usuario'}," if user_name else "Hola,"

        body_html = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">{subject}</h2>
          <p>{greeting}</p>
          <p style="color: #4a4a4a;">{notification.message}</p>
          <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;">
          <p style="font-size: 12px; color: #888;">Este es un mensaje automático de Financial Ops.</p>
        </div>
        """
        body_text = f"{greeting}\n\n{notification.message}\n\n— Financial Ops"

        return self.send_email(
            to_addr=user_email,
            subject=subject,
            body_html=body_html,
            body_text=body_text,
        )

    # ── Push delivery (WebSocket) ─────────────────────────────────────────────

    def send_push_notification(
        self,
        company_id: int,
        user_id: int,
        title: str,
        message: str,
        notification_type: str = "info",
    ) -> bool:
        """Queue a push notification for WebSocket delivery.

        This is a fire-and-forget that posts to the notification WebSocket
        manager if available.
        """
        try:
            from packages.modules.agent.api.agent_ws import manager as ws_manager
            import asyncio

            payload = {
                "type": "notification",
                "title": title,
                "message": message,
                "notification_type": notification_type,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

            # Try to send via WebSocket manager (best-effort)
            if ws_manager and hasattr(ws_manager, "send_to_user"):
                # WebSocket manager exists — schedule the send
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.ensure_future(
                            ws_manager.send_to_user(company_id, user_id, payload)
                        )
                    else:
                        loop.run_until_complete(
                            ws_manager.send_to_user(company_id, user_id, payload)
                        )
                except RuntimeError:
                    # No event loop — not in async context
                    log.debug("No async loop for push notification, skipping")
                    return False

            log.info("Push notification queued for user %s: %s", user_id, title)
            return True
        except ImportError:
            log.debug("WebSocket manager not available for push notification")
            return False
        except Exception as exc:
            log.warning("Failed to send push notification: %s", exc)
            return False


NOTIFICATION_DELIVERY = NotificationDeliveryService()
