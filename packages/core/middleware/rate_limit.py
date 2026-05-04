"""Sliding window rate limiting middleware.

Implements a sliding window rate limiter with burst allowance for
protecting agent and platform API endpoints from abuse.

Supports both per-user and per-company rate limiting to prevent
abuse from single companies with many users.
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


class RateLimiter:
    """Standalone rate limiter with support for per-user and per-company limits.

    A simpler alternative to RateLimitMiddleware for programmatic use.
    Tracks requests per key using a sliding window algorithm.

    Example:
        limiter = RateLimiter(requests_per_minute=60, burst=10)
        if limiter.is_allowed("user:123"):
            # Process request
        remaining = limiter.get_remaining("user:123")
    """

    def __init__(
        self,
        requests_per_minute: int = 60,
        burst: int = 10,
        window_seconds: int = 60,
    ):
        """Initialize the rate limiter.

        Args:
            requests_per_minute: Maximum requests per minute.
            burst: Additional burst allowance.
            window_seconds: Window size in seconds.
        """
        self.requests_per_minute = requests_per_minute
        self.burst = burst
        self.window_seconds = window_seconds
        self._buckets: dict[str, list[float]] = defaultdict(list)

    def _clean_old_requests(self, key: str, now: float) -> None:
        """Remove requests outside the current window."""
        window_start = now - self.window_seconds
        self._buckets[key] = [ts for ts in self._buckets[key] if ts > window_start]

    def is_allowed(self, key: str) -> bool:
        """Check if request is allowed for the given key.

        Args:
            key: Identifier for rate limiting (e.g., "user:123", "company:456").

        Returns:
            True if request should be allowed, False if rate limited.
        """
        now = time.time()
        self._clean_old_requests(key, now)

        count = len(self._buckets[key])

        # Allow if under normal limit
        if count < self.requests_per_minute:
            self._buckets[key].append(now)
            return True

        # Check burst (simplified - just check total)
        if count < self.requests_per_minute + self.burst:
            self._buckets[key].append(now)
            return True

        return False

    def get_remaining(self, key: str) -> int:
        """Get remaining requests for key.

        Args:
            key: Identifier for rate limiting.

        Returns:
            Number of requests remaining in current window.
        """
        now = time.time()
        self._clean_old_requests(key, now)

        count = len(self._buckets[key])
        return max(0, self.requests_per_minute - count)

    def reset(self, key: str | None = None) -> None:
        """Reset rate limit state.

        Args:
            key: Specific key to reset, or None for all.
        """
        if key:
            self._buckets.pop(key, None)
        else:
            self._buckets.clear()


@dataclass
class CompanyRateLimitConfig:
    """Configuration for company-level rate limits.

    Companies get higher rate limits than individual users to account
    for multiple users within a single company.

    Attributes:
        requests_per_minute: Company rate limit (default 1000).
        burst: Company burst allowance (default 100).
    """

    requests_per_minute: int = 1000
    burst: int = 100


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding window rate limiting middleware.

    Rate limits requests based on user identity (from auth header or IP)
    for specified path prefixes. Uses a sliding window algorithm with
    burst allowance.

    The sliding window tracks requests in the last 60 seconds and allows
    up to `requests_per_minute` requests plus `burst` additional requests.
    When the limit is exceeded, returns 429 with Retry-After header.

    Supports both per-user and per-company rate limiting:
    - Company gets higher limit (default 1000 req/min)
    - Each user gets normal limit (default 60 req/min)
    - Both limits are checked; if either exceeds, request is rejected
    """

    def __init__(
        self,
        app,
        config: RateLimitConfig | None = None,
        company_config: CompanyRateLimitConfig | None = None,
        key_func: Callable[[Request], str] | None = None,
    ):
        """Initialize the rate limiting middleware.

        Args:
            app: The FastAPI/Starlette application.
            config: Rate limit configuration. Defaults to RateLimitConfig().
            company_config: Company-level rate limit config. Defaults to CompanyRateLimitConfig().
            key_func: Function to extract user key from request.
                     Defaults to extracting from auth header or IP.
        """
        super().__init__(app)
        self.config = config or RateLimitConfig()
        self.company_config = company_config or CompanyRateLimitConfig()
        self.key_func = key_func or self._default_key_func
        self._buckets: dict[str, UserBucket] = defaultdict(
            lambda: UserBucket(burst_remaining=self.config.burst)
        )
        # Company rate limiter (separate from user limiter)
        self._company_limiter = RateLimiter(
            requests_per_minute=self.company_config.requests_per_minute,
            burst=self.company_config.burst,
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

    def _get_company_id(self, request: Request) -> str | None:
        """Extract company ID from request.

        Priority:
        1. request.state.company_id (set by auth middleware)
        2. X-Company-Id header (for dev bypass)
        3. From request.state.user.company_id

        Args:
            request: The incoming request.

        Returns:
            Company ID string or None.
        """
        # Check request.state.company_id first
        company_id = getattr(request.state, "company_id", None)
        if company_id:
            return str(company_id)

        # Check X-Company-Id header
        x_company = request.headers.get("x-company-id")
        if x_company:
            return x_company

        # Try to get from user object
        user = getattr(request.state, "user", None)
        if user is not None:
            user_company = getattr(user, "company_id", None)
            if user_company:
                return str(user_company)

        return None

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

        Checks both company-level and user-level rate limits.
        Company gets higher limit; both must pass for request to proceed.

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

        # Check company-level rate limit first
        company_id = self._get_company_id(request)
        if company_id:
            company_key = f"company:{company_id}"
            if not self._company_limiter.is_allowed(company_key):
                return Response(
                    content='{"detail":"Company rate limit exceeded. Please try again later.","type":"rate_limit"}',
                    status_code=429,
                    headers={
                        "Retry-After": "60",
                        "Content-Type": "application/json",
                    },
                )

        # Check user-level rate limit
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

        # Process request
        response = await call_next(request)

        # Add rate limit headers for both company and user limits
        if company_id:
            company_key = f"company:{company_id}"
            response.headers["X-RateLimit-Limit-Company"] = str(
                self.company_config.requests_per_minute
            )
            response.headers["X-RateLimit-Remaining-Company"] = str(
                self._company_limiter.get_remaining(company_key)
            )

        # Add user rate limit headers (for all rate-limited requests)
        response.headers["X-RateLimit-Limit-User"] = str(self.config.requests_per_minute)
        response.headers["X-RateLimit-Remaining-User"] = str(self._get_remaining(key))

        return response

    def _get_remaining(self, key: str) -> int:
        """Get remaining requests for a user key.

        Args:
            key: User identifier.

        Returns:
            Number of requests remaining in current window.
        """
        now = time.time()
        bucket = self._buckets[key]
        self._clean_old_requests(bucket, now)
        count = len(bucket.requests)
        return max(0, self.config.requests_per_minute - count)

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