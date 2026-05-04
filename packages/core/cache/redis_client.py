"""Redis client for caching and session storage."""

import json
import os
from typing import Any

REDIS_AVAILABLE = False
redis_client = None

try:
    import redis
    REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    redis_client = redis.from_url(REDIS_URL, decode_responses=False)
    REDIS_AVAILABLE = True
except ImportError:
    pass


class SessionStore:
    """Redis-backed session storage for agent conversations."""

    def __init__(self, prefix: str = "session:"):
        self.prefix = prefix
        self._client = redis_client

    def save(self, session_id: str, data: dict, ttl: int = 3600) -> None:
        """Save session data with TTL."""
        if not REDIS_AVAILABLE:
            return
        try:
            key = f"{self.prefix}{session_id}"
            self._client.setex(key, ttl, json.dumps(data))
        except Exception:
            pass  # Gracefully degrade when Redis unavailable

    def get(self, session_id: str) -> dict | None:
        """Retrieve session data."""
        if not REDIS_AVAILABLE:
            return None
        try:
            key = f"{self.prefix}{session_id}"
            data = self._client.get(key)
            if data:
                return json.loads(data)
            return None
        except Exception:
            return None

    def delete(self, session_id: str) -> None:
        """Delete session."""
        if not REDIS_AVAILABLE:
            return
        try:
            key = f"{self.prefix}{session_id}"
            self._client.delete(key)
        except Exception:
            pass


class PermissionCache:
    """Redis-backed cache for permission checks."""

    def __init__(self, prefix: str = "perms:"):
        self.prefix = prefix
        self._client = redis_client

    def set(self, company_id: int, role_key: str, permissions: list[str], ttl: int = 300) -> None:
        """Cache permissions with TTL (default 5 minutes)."""
        if not REDIS_AVAILABLE:
            return
        try:
            key = f"{self.prefix}{company_id}:{role_key}"
            self._client.setex(key, ttl, json.dumps(permissions))
        except Exception:
            pass  # Gracefully degrade when Redis unavailable

    def get(self, company_id: int, role_key: str) -> list[str] | None:
        """Get cached permissions."""
        if not REDIS_AVAILABLE:
            return None
        try:
            key = f"{self.prefix}{company_id}:{role_key}"
            data = self._client.get(key)
            if data:
                return json.loads(data)
            return None
        except Exception:
            return None

    def clear(self, company_id: int, role_key: str) -> None:
        """Clear cached permissions."""
        if not REDIS_AVAILABLE:
            return
        try:
            key = f"{self.prefix}{company_id}:{role_key}"
            self._client.delete(key)
        except Exception:
            pass

    def clear_company(self, company_id: int) -> None:
        """Clear all cached permissions for a company."""
        if not REDIS_AVAILABLE:
            return
        try:
            pattern = f"{self.prefix}{company_id}:*"
            keys = self._client.keys(pattern)
            if keys:
                self._client.delete(*keys)
        except Exception:
            pass