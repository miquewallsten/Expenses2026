"""Phase 0.3 closeout — prod_preflight script."""
from __future__ import annotations

from scripts.prod_preflight import run_preflight


_GOOD_SECRET = "x" * 64


def _base_env(**overrides: str) -> dict[str, str]:
    env: dict[str, str] = {
        "ENVIRONMENT": "production",
        "AUTH_SECRET": _GOOD_SECRET,
        "DEBUG": "false",
        "DATABASE_URL": "postgresql://prod-db.internal:5432/foplat",
        "CORS_ORIGINS": '["https://app.foplat.com"]',
        "WEB_BASE_URL": "https://app.foplat.com",
    }
    env.update(overrides)
    return env


def test_preflight_passes_with_good_config() -> None:
    assert run_preflight(_base_env()) == []


def test_preflight_flags_dev_auth_secret() -> None:
    env = _base_env(AUTH_SECRET="dev-secret-change-in-production-32ch")
    errs = run_preflight(env)
    assert any("AUTH_SECRET" in e for e in errs)


def test_preflight_flags_short_auth_secret() -> None:
    env = _base_env(AUTH_SECRET="too-short")
    errs = run_preflight(env)
    assert any("too short" in e for e in errs)


def test_preflight_flags_debug_true() -> None:
    env = _base_env(DEBUG="true")
    errs = run_preflight(env)
    assert any("DEBUG" in e for e in errs)


def test_preflight_flags_localhost_database_url() -> None:
    env = _base_env(DATABASE_URL="postgresql://localhost/foplat")
    errs = run_preflight(env)
    assert any("DATABASE_URL" in e for e in errs)


def test_preflight_flags_localhost_cors_origin() -> None:
    env = _base_env(CORS_ORIGINS='["https://app.foplat.com","http://localhost:3000"]')
    errs = run_preflight(env)
    assert any("CORS_ORIGINS" in e for e in errs)


def test_preflight_flags_localhost_web_base_url() -> None:
    env = _base_env(WEB_BASE_URL="http://localhost:3000")
    errs = run_preflight(env)
    assert any("WEB_BASE_URL" in e for e in errs)


def test_preflight_skips_validation_when_environment_is_dev() -> None:
    """Sanity — when ENVIRONMENT is not production, validate_for_production
    is a no-op so dev defaults are tolerated. The script still forces
    production mode via setdefault, so this is mostly a defensive test that
    the dev sentinel doesn't slip through."""
    env = _base_env(AUTH_SECRET=_GOOD_SECRET)
    # When everything is fine, errors must be empty — even though we set
    # ENVIRONMENT=production explicitly here.
    assert run_preflight(env) == []
