import smtplib
import imaplib
import logging
from typing import Dict, Any, Optional

_log = logging.getLogger(__name__)

async def test_smtp_connection(config: Dict[str, Any]) -> Dict[str, Any]:
    """Test SMTP connection with provided credentials"""
    host = config.get("smtp_host")
    port = int(config.get("smtp_port") or 587)
    user = config.get("smtp_user")
    password = config.get("smtp_password")
    
    if not host:
        return {"ok": False, "error": "SMTP Host is missing"}

    try:
        # Use a short timeout for the test
        with smtplib.SMTP(host, port, timeout=10) as smtp:
            # Most modern servers use STARTTLS
            try:
                smtp.starttls()
            except Exception as e:
                _log.warning(f"STARTTLS failed (might not be supported): {e}")

            if user and password:
                smtp.login(user, password)
            
            # Simple NOOP to verify session
            smtp.noop()
            
        return {"ok": True, "message": "SMTP connection successful"}
    except Exception as e:
        _log.error(f"SMTP Test Failed: {e}")
        return {"ok": False, "error": str(e)}

async def test_imap_connection(config: Dict[str, Any]) -> Dict[str, Any]:
    """Test IMAP connection with provided credentials"""
    host = config.get("imap_host")
    port = int(config.get("imap_port") or 993)
    user = config.get("imap_user")
    password = config.get("imap_password")
    
    if not host:
        return {"ok": False, "error": "IMAP Host is missing"}

    try:
        # IMAP4_SSL for port 993, IMAP4 for port 143 (usually)
        if port == 993:
            imap = imaplib.IMAP4_SSL(host, port, timeout=10)
        else:
            imap = imaplib.IMAP4(host, port, timeout=10)
            
        if user and password:
            imap.login(user, password)
            
        # Select INBOX to verify access
        imap.select("INBOX")
        imap.logout()
        
        return {"ok": True, "message": "IMAP connection successful"}
    except Exception as e:
        _log.error(f"IMAP Test Failed: {e}")
        return {"ok": False, "error": str(e)}
