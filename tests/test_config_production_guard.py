"""Phase 0.3 — AUTH_SECRET production hardening tests."""
import pytest

from apps.api.config import Settings, _DEV_AUTH_SECRET_SENTINEL


def _mk(**overrides) -> Settings:
    defaults = dict(
        environment="production",
        debug=False,
        auth_secret="x" * 64,
    )
    defaults.update(overrides)
    return Settings(**defaults)


def test_dev_default_secret_is_rejected_in_prod():
    s = _mk(auth_secret=_DEV_AUTH_SECRET_SENTINEL)
    with pytest.raises(RuntimeError) as exc:
        s.validate_for_production()
    assert "AUTH_SECRET" in str(exc.value)


def test_short_secret_is_rejected_in_prod():
    s = _mk(auth_secret="short")
    with pytest.raises(RuntimeError) as exc:
        s.validate_for_production()
    assert "too short" in str(exc.value).lower()


def test_debug_true_is_rejected_in_prod():
    s = _mk(debug=True)
    with pytest.raises(RuntimeError) as exc:
        s.validate_for_production()
    assert "DEBUG" in str(exc.value)


def test_valid_prod_config_passes():
    s = _mk()
    s.validate_for_production()  # no raise


def test_dev_environment_is_noop_even_with_insecure_values():
    # development config should NOT fail — it's expected to use the dev default.
    s = Settings(environment="development", debug=True, auth_secret=_DEV_AUTH_SECRET_SENTINEL)
    s.validate_for_production()  # no raise


def test_staging_is_treated_as_production():
    s = _mk(environment="staging", auth_secret=_DEV_AUTH_SECRET_SENTINEL)
    with pytest.raises(RuntimeError):
        s.validate_for_production()
