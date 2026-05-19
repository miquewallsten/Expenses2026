"""Phase 8.5 — APScheduler bootstrap for agent jobs.

Opt-in via ``AGENT_SCHEDULER_ENABLED``. Independent from the channels
scheduler so that an operator can run insight digests without enabling
channel notifications, or vice versa.

The single registered job runs the agent insight digest once per day at
02:00 UTC (post-channels-digest window so cross-company scans see the
prior day's data).
"""

from __future__ import annotations

import logging
import os

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from apps.api.deps import get_db
from packages.modules.agent.jobs.insight_digest import run_daily_insight_digest

log = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _open_session():
    gen = get_db()
    db = next(gen)
    return db, gen


def _job_daily_insight_digest() -> None:
    log.info("Running agent daily insight digest…")
    db, gen = _open_session()
    try:
        run_daily_insight_digest(db)
    except Exception:
        log.exception("daily insight digest job crashed")
    finally:
        try:
            next(gen)
        except StopIteration:
            pass


def _job_cleanup() -> None:
    log.info("Running agent data cleanup…")
    from packages.modules.agent.jobs.cleanup import run_cleanup
    db, gen = _open_session()
    try:
        result = run_cleanup()
        log.info("Agent cleanup: %s", result)
    except Exception:
        log.exception("agent cleanup job crashed")
    finally:
        try:
            next(gen)
        except StopIteration:
            pass


def start_scheduler() -> BackgroundScheduler | None:
    """Create and start the agent scheduler if enabled. Idempotent."""
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    if os.environ.get("AGENT_SCHEDULER_ENABLED", "").lower() not in (
        "1",
        "true",
        "yes",
    ):
        log.info("AGENT_SCHEDULER_ENABLED not set — skipping agent scheduler.")
        return None

    sched = BackgroundScheduler(timezone="UTC")
    sched.add_job(
        _job_daily_insight_digest,
        trigger=CronTrigger(hour=2, minute=0),
        id="agent.daily_insight_digest",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    sched.add_job(
        _job_cleanup,
        trigger=CronTrigger(hour=3, minute=0),
        id="agent.daily_cleanup",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    sched.start()
    _scheduler = sched
    log.info("APScheduler started for agent jobs (insight digest @ 02:00 UTC).")
    return sched


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
