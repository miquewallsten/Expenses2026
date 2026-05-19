"""Celery background tasks."""

import logging

from packages.core.cache.redis_client import REDIS_AVAILABLE, redis_client
from packages.core.jobs.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    name="process_cfdi_recheck",
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 60},
)
def process_cfdi_recheck(company_ids: list[int] | None = None) -> dict:
    """Process CFDI recheck for all companies or specified companies.

    This task runs daily to check CFDI status for all pending expenses.

    Args:
        company_ids: Optional list of company IDs. If None, process all companies.

    Returns:
        dict with processed count and any errors
    """
    from apps.api.db import SessionLocal
    from packages.core.platform.models import Company
    from packages.modules.expenses.service.cfdi_lifecycle_service import recheck_pending

    db = SessionLocal()
    processed = 0
    errors = []
    totals = {"checked": 0, "flipped": 0, "skipped": 0}

    try:
        # Get companies to process
        if company_ids:
            companies = db.query(Company).filter(Company.id.in_(company_ids)).all()
        else:
            companies = db.query(Company).all()

        for company in companies:
            try:
                result = recheck_pending(
                    db,
                    company_id=company.id,
                    stale_after_days=7,
                    batch_size=100,
                )
                for k in ("checked", "flipped", "skipped"):
                    totals[k] += int(result.get(k, 0))
                processed += 1
                logger.info(f"CFDI recheck for company {company.id}")
            except Exception as e:
                logger.exception(f"CFDI recheck failed for company {company.id}")
                errors.append({"company_id": company.id, "error": str(e)})

        return {
            "processed": processed,
            "errors": errors,
            "total_companies": len(companies),
            **totals,
        }

    finally:
        db.close()


@celery_app.task(
    name="cleanup_expired_sessions",
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 2, "countdown": 30},
)
def cleanup_expired_sessions() -> dict:
    """Clean up expired agent session from Redis.

    This task runs hourly to remove stale session data.

    Returns:
        dict with cleanup stats
    """
    if not REDIS_AVAILABLE:
        return {"cleaned": 0, "message": "Redis not available"}

    try:
        # Find all session keys
        keys = redis_client.keys("session:*")
        cleaned = 0

        for key in keys:
            ttl = redis_client.ttl(key)
            if ttl == -2:  # Key doesn't exist
                cleaned += 1
            elif ttl == -1:  # Key exists but has no TTL (stale)
                redis_client.delete(key)
                cleaned += 1

        logger.info(f"Session cleanup: removed {cleaned} stale sessions")
        return {"cleaned": cleaned}

    except Exception as e:
        logger.exception("Session cleanup failed")
        return {"cleaned": 0, "error": str(e)}