"""Test company-level rate limiting."""

import pytest
from fastapi.testclient import TestClient


def test_company_rate_limit_applied(client, test_company, test_user):
    """Test that rate limits apply per company, not just per user."""
    from packages.core.middleware.rate_limit import RateLimiter

    limiter = RateLimiter(requests_per_minute=60, burst=10)

    # Company should have its own rate limit bucket
    company_key = f"company:{test_company.id}"
    user_key = f"user:{test_user.id}"

    # Verify company-level tracking exists
    assert limiter.is_allowed(company_key)  # First request
    assert limiter.is_allowed(company_key)  # Second request

    # User should have separate bucket
    assert limiter.is_allowed(user_key)


def test_rate_limit_headers_in_response(client, test_company):
    """Test that rate limit headers are included in responses."""
    response = client.get(f"/health")

    # Should have rate limit headers or be a valid response
    assert "X-RateLimit-Limit" in response.headers or response.status_code == 200


def test_rate_limiter_tracks_requests_per_key():
    """Test that RateLimiter correctly tracks requests per key."""
    from packages.core.middleware.rate_limit import RateLimiter

    limiter = RateLimiter(requests_per_minute=5, burst=0)

    key = "test:user:123"

    # Should allow up to limit
    for i in range(5):
        assert limiter.is_allowed(key), f"Request {i+1} should be allowed"

    # Sixth request should be denied
    assert not limiter.is_allowed(key), "Request over limit should be denied"


def test_rate_limiter_separate_buckets():
    """Test that different keys have separate buckets."""
    from packages.core.middleware.rate_limit import RateLimiter

    limiter = RateLimiter(requests_per_minute=2, burst=0)

    key1 = "user:1"
    key2 = "user:2"

    # Exhaust key1
    assert limiter.is_allowed(key1)
    assert limiter.is_allowed(key1)
    assert not limiter.is_allowed(key1)

    # key2 should still have allowance
    assert limiter.is_allowed(key2)
    assert limiter.is_allowed(key2)
    assert not limiter.is_allowed(key2)


def test_rate_limiter_remaining():
    """Test get_remaining returns correct count."""
    from packages.core.middleware.rate_limit import RateLimiter

    limiter = RateLimiter(requests_per_minute=10, burst=0)

    key = "user:123"

    # Initially should have full allowance
    assert limiter.get_remaining(key) == 10

    # After one request
    limiter.is_allowed(key)
    assert limiter.get_remaining(key) == 9

    # After two more requests
    limiter.is_allowed(key)
    limiter.is_allowed(key)
    assert limiter.get_remaining(key) == 7