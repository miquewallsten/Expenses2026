"""Phase 4.8 follow-up — APScheduler bootstrap for CFDI lifecycle watcher.

Opt-in via ``CFDI_SCHEDULER_ENABLED``. Independent from the channels +
agent schedulers so an operator can run the SAT cancel watcher without
enabling unrelated jobs.

The single registered job runs ``recheck_pending`` once per day at
03:00 UTC (after the channels digest @ 02:00 + agent insight digest
@ 02:00 windows). Per-company iteration: scans all companies, skipping
already-cancelled and recently-checked rows. Best-effort — exceptions
are logged and never propagate.
"""

from __future__ import annotations

import logging
import os

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from apps.api.deps import get_db
from packages.core.platform.models import Company
from packages.modules.expenses.service.cfdi_lifecycle_service import recheck_pending

log = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None

_STALE_AFTER_DAYS = int(os.environ.get("CFDI_RECHECK_STALE_DAYS", "7"))
_BATCH_SIZE = int(os.environ.get("CFDI_RECHECK_BATCH_SIZE", "100"))


def _open_session():
    gen = get_db()
    db = next(gen)
    return db, gen


def run_cfdi_recheck_all_companies(db) -> dict[str, int]:
    """Iterate every company and recheck pending CFDIs. Returns rollup totals."""
    totals = {"checked": 0, "flipped": 0, "skipped": 0, "companies": 0}
    company_ids = [cid for (cid,) in db.query(Company.id).all()]
    for cid in company_ids:
        try:
            res = recheck_pending(
                db,
                company_id=cid,
                stale_after_days=_STALE_AFTER_DAYS,
                batch_size=_BATCH_SIZE,
            )
        except Exception:
            log.exception("recheck_pending failed for company %s", cid)
            continue
        totals["companies"] += 1
        for k in ("checked", "flipped", "skipped"):
            totals[k] += int(res.get(k, 0))
    return totals


def _job_cfdi_recheck() -> None:
    log.info("Running CFDI lifecycle recheck across all companies…")
    db, gen = _open_session()
    try:
        totals = run_cfdi_recheck_all_companies(db)
        log.info("CFDI recheck rollup: %s", totals)
    except Exception:
        log.exception("CFDI recheck job crashed")
    finally:
        try:
            next(gen)
        except StopIteration:
            pass


def start_scheduler() -> BackgroundScheduler | None:
    """Create and start the CFDI scheduler if enabled. Idempotent."""
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    if os.environ.get("CFDI_SCHEDULER_ENABLED", "").lower() not in (
        "1",
        "true",
        "yes",
    ):
        log.info("CFDI_SCHEDULER_ENABLED not set — skipping CFDI scheduler.")
        return None

    sched = BackgroundScheduler(timezone="UTC")
    sched.add_job(
        _job_cfdi_recheck,
        trigger=CronTrigger(hour=3, minute=0),
        id="cfdi.daily_recheck",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    sched.start()
    _scheduler = sched
    log.info("APScheduler started for CFDI watcher (recheck @ 03:00 UTC).")
    return sched


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
