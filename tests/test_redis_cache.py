"""Test Redis cache integration."""

import pytest
import json


def test_redis_client_connection():
    """Test that Redis client connects successfully."""
    from packages.core.cache.redis_client import redis_client, REDIS_AVAILABLE

    if not REDIS_AVAILABLE:
        pytest.skip("Redis not available")

    # Test basic operations
    redis_client.set("test_key", "test_value", ex=10)
    assert redis_client.get("test_key") == b"test_value"
    redis_client.delete("test_key")


def test_session_storage():
    """Test storing agent sessions in Redis."""
    from packages.core.cache.redis_client import SessionStore, REDIS_AVAILABLE

    if not REDIS_AVAILABLE:
        pytest.skip("Redis not available")

    store = SessionStore()

    session_id = "test_session_123"
    session_data = {
        "company_id": 1,
        "user_id": 1,
        "turns": [{"role": "user", "content": "Hello"}],
    }

    # Save session
    store.save(session_id, session_data, ttl=3600)

    # Retrieve session
    retrieved = store.get(session_id)
    assert retrieved["company_id"] == 1
    assert len(retrieved["turns"]) == 1

    # Delete session
    store.delete(session_id)
    assert store.get(session_id) is None


def test_permission_cache():
    """Test permission caching in Redis."""
    from packages.core.cache.redis_client import PermissionCache, REDIS_AVAILABLE

    if not REDIS_AVAILABLE:
        pytest.skip("Redis not available")

    cache = PermissionCache()

    # Cache a permission check
    cache.set(company_id=1, role_key="admin", permissions=["read", "write"], ttl=300)

    # Retrieve cached permissions
    perms = cache.get(company_id=1, role_key="admin")
    assert perms == ["read", "write"]

    # Clear cache
    cache.clear(company_id=1, role_key="admin")
    assert cache.get(company_id=1, role_key="admin") is None