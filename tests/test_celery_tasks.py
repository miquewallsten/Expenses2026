"""Test Celery background tasks."""

import pytest


def test_celery_app_configuration():
    """Test that Celery app is configured correctly."""
    from packages.core.jobs.celery_app import celery_app

    assert celery_app.conf.broker_url is not None
    assert "redis" in celery_app.conf.broker_url.lower()


def test_cfdi_recheck_task_definition():
    """Test that CFDI recheck task is defined."""
    from packages.core.jobs.tasks import process_cfdi_recheck

    assert process_cfdi_recheck.name == "process_cfdi_recheck"
    assert hasattr(process_cfdi_recheck, "delay")


def test_task_can_be_enqueued():
    """Test that a task can be enqueued (requires Redis)."""
    try:
        from packages.core.jobs.tasks import process_cfdi_recheck

        # This will fail if Redis not available, which is OK for test
        result = process_cfdi_recheck.delay(company_ids=[1])
        # Task was enqueued
        assert result.id is not None
    except Exception as e:
        # If Redis not available, task registration still works
        if "redis" in str(e).lower() or "connection" in str(e).lower():
            pytest.skip("Redis not available")
        raise


def test_cleanup_sessions_task_definition():
    """Test that cleanup sessions task is defined."""
    from packages.core.jobs.tasks import cleanup_expired_sessions

    assert cleanup_expired_sessions.name == "cleanup_expired_sessions"
    assert hasattr(cleanup_expired_sessions, "delay")


def test_beat_schedule_configured():
    """Test that periodic tasks are scheduled."""
    from packages.core.jobs.celery_app import celery_app

    assert "cfdi-daily-recheck" in celery_app.conf.beat_schedule
    assert "cleanup-expired-sessions" in celery_app.conf.beat_schedule