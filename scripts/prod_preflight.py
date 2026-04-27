"""Phase 0.3 — production preflight checker.

Loads `apps.api.config.Settings` under ENVIRONMENT=production and surfaces
every misconfiguration as a structured failure list. Used by CI on release
branches to gate deploy.

Exit codes:
    0  — every check passed
    1  — one or more checks failed
    2  — script-level error (import failure, etc.)

Checks (in order):
    1. AUTH_SECRET not the dev sentinel and ≥32 chars
    2. DEBUG=false
    3. DATABASE_URL not pointing at localhost
    4. CORS_ORIGINS contains no `localhost` / `127.0.0.1` entries
    5. WEB_BASE_URL not localhost

The script never imports the FastAPI app — config validation only — so it
runs without a live DB.

Usage:
    ENVIRONMENT=production AUTH_SECRET=... python3 scripts/prod_preflight.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Ensure repo root is on sys.path when run directly via `python3 scripts/...`.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


def _has_local_host(value: str) -> bool:
    v = (value or "").lower()
    return "localhost" in v or "127.0.0.1" in v


def run_preflight(env: dict[str, str] | None = None) -> list[str]:
    """Return a list of failure strings; empty list means everything is fine.

    Accepts an optional ``env`` mapping for testability so callers don't
    have to mutate ``os.environ``.
    """
    env = env if env is not None else dict(os.environ)
    env.setdefault("ENVIRONMENT", "production")

    # Targeted overrides — Settings reads from os.environ on instantiation,
    # so we set only the keys we need (and restore them) instead of clearing
    # the full environment (which would break module resolution / PATH).
    _RELEVANT = (
        "ENVIRONMENT",
        "AUTH_SECRET",
        "DEBUG",
        "DATABASE_URL",
        "CORS_ORIGINS",
        "WEB_BASE_URL",
        "OLLAMA_BASE_URL",
        "OLLAMA_MODEL",
    )
    saved: dict[str, str | None] = {k: os.environ.get(k) for k in _RELEVANT}
    try:
        for k in _RELEVANT:
            if k in env:
                os.environ[k] = env[k]
            elif k in os.environ:
                # Caller passed an env that omits this key — drop it so
                # Settings falls back to its declared default rather than
                # whatever the host has set.
                del os.environ[k]

        # `Settings()` reads from `os.environ` at instantiation, so overriding
        # the relevant keys above is sufficient — no module reload required.
        from apps.api.config import Settings  # type: ignore[import-not-found]

        settings = Settings()
    finally:
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    errors: list[str] = []

    # 1+2: delegate to existing validator (covers AUTH_SECRET + DEBUG).
    try:
        settings.validate_for_production()
    except RuntimeError as e:
        errors.append(str(e))

    # 3: DATABASE_URL must not point at localhost in prod.
    if _has_local_host(settings.database_url):
        errors.append(
            "DATABASE_URL points at localhost; production must use a real host."
        )

    # 4: CORS_ORIGINS — no localhost entries in prod.
    bad_origins = [o for o in settings.cors_origins if _has_local_host(o)]
    if bad_origins:
        errors.append(
            "CORS_ORIGINS contains localhost entries: "
            + ", ".join(bad_origins)
        )

    # 5: WEB_BASE_URL — no localhost in prod.
    if _has_local_host(settings.web_base_url):
        errors.append("WEB_BASE_URL points at localhost; production must use a real host.")

    return errors


def main() -> int:
    try:
        errors = run_preflight()
    except Exception as exc:  # noqa: BLE001
        print(f"prod_preflight: script error: {exc}", file=sys.stderr)
        return 2

    if errors:
        print("prod_preflight: FAILED", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print("prod_preflight: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
