"""Sliding window rate limiting middleware.

Implements a sliding window rate limiter with burst allowance for
protecting agent and platform API endpoints from abuse.
"""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


@dataclass
class RateLimitConfig:
    """Configuration for rate limiting middleware.

    Attributes:
        requests_per_minute: Maximum requests allowed per minute per user.
        burst: Additional burst allowance on top of the rate limit.
        paths: Tuple of path prefixes to apply rate limiting to.
    """

    requests_per_minute: int = 60
    burst: int = 10
    paths: tuple[str, ...] = ("/api/agent/", "/api/platform/")

    @property
    def window_seconds(self) -> int:
        """Rate limit window in seconds (60 seconds = 1 minute)."""
        return 60


@dataclass
class UserBucket:
    """Sliding window bucket for tracking requests per user.

    Uses a sliding window algorithm that tracks request timestamps
    within the current window and allows burst requests.

    Attributes:
        requests: List of request timestamps within the window.
        burst_remaining: Remaining burst allowance.
    """

    requests: list[float] = field(default_factory=list)
    burst_remaining: int = 0


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding window rate limiting middleware.

    Rate limits requests based on user identity (from auth header or IP)
    for specified path prefixes. Uses a sliding window algorithm with
    burst allowance.

    The sliding window tracks requests in the last 60 seconds and allows
    up to `requests_per_minute` requests plus `burst` additional requests.
    When the limit is exceeded, returns 429 with Retry-After header.
    """

    def __init__(
        self,
        app,
        config: RateLimitConfig | None = None,
        key_func: Callable[[Request], str] | None = None,
    ):
        """Initialize the rate limiting middleware.

        Args:
            app: The FastAPI/Starlette application.
            config: Rate limit configuration. Defaults to RateLimitConfig().
            key_func: Function to extract user key from request.
                     Defaults to extracting from auth header or IP.
        """
        super().__init__(app)
        self.config = config or RateLimitConfig()
        self.key_func = key_func or self._default_key_func
        self._buckets: dict[str, UserBucket] = defaultdict(
            lambda: UserBucket(burst_remaining=self.config.burst)
        )

    def _default_key_func(self, request: Request) -> str:
        """Extract a user identifier from the request.

        Priority:
        1. Authenticated user ID from request.state.user
        2. X-User-Id header (for dev bypass)
        3. Remote IP address

        Args:
            request: The incoming request.

        Returns:
            A string key identifying the user/client.
        """
        user = getattr(request.state, "user", None)
        if user is not None:
            return f"user:{getattr(user, 'id', '?')}"
        x_user = request.headers.get("x-user-id")
        if x_user:
            return f"user:{x_user}"
        return f"ip:{self._get_client_ip(request)}"

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP address from request.

        Handles X-Forwarded-For header for proxied requests.

        Args:
            request: The incoming request.

        Returns:
            Client IP address string.
        """
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        if request.client:
            return request.client.host
        return "unknown"

    def _is_rate_limited_path(self, path: str) -> bool:
        """Check if path should be rate limited.

        Args:
            path: Request path.

        Returns:
            True if path matches any configured prefix.
        """
        return any(path.startswith(prefix) for prefix in self.config.paths)

    def _clean_old_requests(self, bucket: UserBucket, now: float) -> None:
        """Remove requests outside the current window.

        Args:
            bucket: User's rate limit bucket.
            now: Current timestamp.
        """
        window_start = now - self.config.window_seconds
        # Filter requests within window, keep order
        bucket.requests = [ts for ts in bucket.requests if ts > window_start]

    def _check_rate_limit(self, key: str) -> tuple[bool, int]:
        """Check if request should be rate limited.

        Uses sliding window algorithm:
        1. Clean expired requests from window
        2. Count requests in current window
        3. Allow if under limit, or if burst available
        4. Reject if over limit and burst exhausted

        Args:
            key: User identifier.

        Returns:
            Tuple of (is_allowed, retry_after_seconds).
            is_allowed: True if request should proceed.
            retry_after: Seconds until limit resets (0 if allowed).
        """
        now = time.time()
        bucket = self._buckets[key]

        self._clean_old_requests(bucket, now)

        request_count = len(bucket.requests)
        limit = self.config.requests_per_minute

        if request_count < limit:
            # Under normal limit, allow
            bucket.requests.append(now)
            return True, 0

        if bucket.burst_remaining > 0:
            # Over limit but burst available
            bucket.burst_remaining -= 1
            bucket.requests.append(now)
            return True, 0

        # Rate limited - calculate retry after
        if bucket.requests:
            # Oldest request in window determines when window slides
            oldest_in_window = min(bucket.requests)
            retry_after = int(oldest_in_window + self.config.window_seconds - now) + 1
            retry_after = max(1, retry_after)  # At least 1 second
        else:
            retry_after = 1

        return False, retry_after

    async def dispatch(self, request: Request, call_next) -> Response:
        """Process request through rate limiter.

        Args:
            request: The incoming request.
            call_next: The next middleware/route handler.

        Returns:
            Either the normal response or 429 if rate limited.
        """
        path = request.url.path

        # Skip rate limiting for non-matching paths
        if not self._is_rate_limited_path(path):
            return await call_next(request)

        key = self.key_func(request)
        is_allowed, retry_after = self._check_rate_limit(key)

        if not is_allowed:
            return Response(
                content='{"detail":"Rate limit exceeded","type":"rate_limit"}',
                status_code=429,
                headers={
                    "Retry-After": str(retry_after),
                    "Content-Type": "application/json",
                },
            )

        return await call_next(request)

    def reset(self, key: str | None = None) -> None:
        """Reset rate limit state.

        Useful for testing or administrative resets.

        Args:
            key: Specific user key to reset, or None for all.
        """
        if key:
            self._buckets.pop(key, None)
        else:
            self._buckets.clear()