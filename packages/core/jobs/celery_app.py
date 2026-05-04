"""Celery application configuration."""

import os

from celery import Celery

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "financial_ops",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["packages.core.jobs.tasks"],
)

# Configuration
celery_app.conf.update(
    # Task settings
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Task routing
    task_routes={
        "packages.core.jobs.tasks.*": {"queue": "default"},
    },
    # Retry settings
    task_default_retry_delay=60,  # 1 minute
    task_max_retries=3,
    # Worker settings
    worker_prefetch_multiplier=1,  # One task per worker at a time
    worker_concurrency=4,  # Number of concurrent workers
)

# Schedule periodic tasks
celery_app.conf.beat_schedule = {
    "cfdi-daily-recheck": {
        "task": "packages.core.jobs.tasks.process_cfdi_recheck",
        "schedule": 60.0 * 60.0 * 24.0,  # Every 24 hours
        "args": None,
    },
    "cleanup-expired-sessions": {
        "task": "packages.core.jobs.tasks.cleanup_expired_sessions",
        "schedule": 60.0 * 60.0,  # Every hour
        "args": None,
    },
}