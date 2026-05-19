"""Agent data cleanup job — purges stale rows from AgentMemory and AgentUsage.

Memory rows past their ``expires_at`` are deleted.  Usage rows older than
``AGENT_USAGE_TTL_DAYS`` (default 90) are purged.  The job is registered
in the agent scheduler alongside the insight digest.

Set ``AGENT_CLEANUP_ENABLED=1`` (or true/yes) to activate.  Runs daily at
03:00 UTC.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone, timedelta

from sqlalchemy import delete, func

from apps.api.deps import get_db
from packages.modules.agent.models import AgentMemory, AgentUsage

_log = logging.getLogger(__name__)

USAGE_TTL_DAYS = int(os.environ.get("AGENT_USAGE_TTL_DAYS", "90"))


def _open_session():
    gen = get_db()
    db = next(gen)
    return db, gen


def cleanup_expired_memory() -> int:
    """Delete AgentMemory rows past their expires_at. Returns count deleted."""
    db, gen = _open_session()
    try:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        result = db.query(AgentMemory).filter(
            AgentMemory.expires_at.isnot(None),
            AgentMemory.expires_at < now,
        ).delete(synchronize_session=False)
        db.commit()
        _log.info("Cleaned up %d expired AgentMemory rows", result)
        return result
    except Exception:
        db.rollback()
        _log.exception("Failed to clean up expired AgentMemory")
        return 0
    finally:
        try:
            next(gen)
        except StopIteration:
            pass


def cleanup_stale_usage() -> int:
    """Delete AgentUsage rows older than USAGE_TTL_DAYS. Returns count deleted."""
    db, gen = _open_session()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=USAGE_TTL_DAYS)
        result = db.query(AgentUsage).filter(
            AgentUsage.created_at < cutoff.replace(tzinfo=None),
        ).delete(synchronize_session=False)
        db.commit()
        _log.info("Cleaned up %d stale AgentUsage rows (older than %d days)", result, USAGE_TTL_DAYS)
        return result
    except Exception:
        db.rollback()
        _log.exception("Failed to clean up stale AgentUsage")
        return 0
    finally:
        try:
            next(gen)
        except StopIteration:
            pass


def run_cleanup() -> dict[str, int]:
    """Run all cleanup tasks. Returns a summary dict."""
    memory = cleanup_expired_memory()
    usage = cleanup_stale_usage()
    return {"memory_deleted": memory, "usage_deleted": usage}
