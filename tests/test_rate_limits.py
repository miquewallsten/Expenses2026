"""Phase 0.7 — slowapi rate limits + Ollama hardening smoke tests."""


def test_limiter_is_configured():
    from apps.api import rate_limit

    assert rate_limit.limiter is not None
    assert rate_limit.RATE_LIMIT_AUTH
    assert rate_limit.RATE_LIMIT_AI
    assert rate_limit.RATE_LIMIT_DEFAULT


def test_auth_routes_registered():
    from apps.api.routes import auth as auth_routes

    paths = {r.path for r in auth_routes.router.routes}
    assert any("magic-link/request" in p for p in paths)
    assert any("magic-link/verify" in p for p in paths)


def test_ai_routes_registered():
    from apps.api.ai import routes as ai_routes

    paths = {r.path for r in ai_routes.router.routes}
    assert any(p.endswith("/chat") for p in paths)
    assert any(p.endswith("/chat/stream") for p in paths)


def test_ollama_client_has_bounded_timeouts():
    from apps.api.ai import ollama_client as oc

    assert oc.OLLAMA_CHAT_TIMEOUT > 0
    assert oc.OLLAMA_TOOL_TIMEOUT > 0
    assert oc.OLLAMA_STREAM_TIMEOUT > 0
    assert oc.OLLAMA_MAX_PROMPT_CHARS >= 1000


def test_prompt_truncation_caps_long_input():
    from apps.api.ai.ollama_client import _truncate_prompt, OLLAMA_MAX_PROMPT_CHARS

    long_text = "x" * (OLLAMA_MAX_PROMPT_CHARS * 3)
    out = _truncate_prompt(long_text, "test")
    assert len(out) <= OLLAMA_MAX_PROMPT_CHARS + 200
