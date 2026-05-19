"""Phase 1.5 — APScheduler bootstrap for channel notification jobs.

The scheduler is opt-in via ``CHANNELS_SCHEDULER_ENABLED`` so test runs and
ad-hoc CLI commands never spawn background timers. In production, the
backend container should set the env var and let APScheduler manage cron
triggers.
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from apps.api.deps import get_db
from packages.modules.channels.jobs.digest import (
    run_48h_nudges,
    run_daily_digest,
)
from packages.modules.channels.jobs.retry_dispatches import retry_pending_dispatches

if TYPE_CHECKING:
    pass

log = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _open_session():
    """Yield a Session via the FastAPI dep generator and ensure cleanup."""
    gen = get_db()
    db = next(gen)
    try:
        return db, gen
    except Exception:
        gen.close()
        raise


def _run_with_session(fn, *args, **kwargs) -> None:
    db, gen = _open_session()
    try:
        fn(db, *args, **kwargs)
    finally:
        try:
            next(gen)
        except StopIteration:
            pass


def _job_daily_digest() -> None:
    log.info("Running daily approver digest…")
    try:
        _run_with_session(run_daily_digest)
    except Exception:
        log.exception("daily digest job crashed")


def _job_48h_nudges() -> None:
    log.info("Running 48h approval nudges…")
    try:
        _run_with_session(run_48h_nudges)
    except Exception:
        log.exception("48h nudge job crashed")


def _job_retry_dispatches() -> None:
    log.info("Running notification dispatch retry…")
    try:
        _run_with_session(retry_pending_dispatches)
    except Exception:
        log.exception("dispatch retry job crashed")


def start_scheduler() -> BackgroundScheduler | None:
    """Create + start the scheduler if enabled. Idempotent."""
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    if os.environ.get("CHANNELS_SCHEDULER_ENABLED", "").lower() not in (
        "1",
        "true",
        "yes",
    ):
        log.info("CHANNELS_SCHEDULER_ENABLED not set — skipping scheduler start.")
        return None

    sched = BackgroundScheduler(timezone="America/Mexico_City")
    sched.add_job(
        _job_daily_digest,
        trigger=CronTrigger(hour=8, minute=0),
        id="channels.daily_digest",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    sched.add_job(
        _job_48h_nudges,
        trigger=CronTrigger(hour=9, minute=0),
        id="channels.approval_nudge_48h",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    sched.add_job(
        _job_retry_dispatches,
        trigger=IntervalTrigger(minutes=1),
        id="channels.retry_dispatches",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    sched.start()
    _scheduler = sched
    log.info("APScheduler started with channel notification jobs (incl. dispatch retry @ 1min).")
    return sched


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
