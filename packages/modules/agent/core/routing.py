"""Model routing + usage logging for agent turns.

Hybrid strategy:
    * Default: use local Ollama model resolved by ``resolve_model()``.
    * If the caller sets ``hard_mode=True``, prefer a hosted override model set
      via the env var ``AGENT_HOSTED_MODEL`` (only active when
      ``AGENT_HOSTED_ENABLED`` is truthy).

Note: ``HARD_MODE_TOOL_THRESHOLD`` is set to 999, so threshold-based routing is
effectively opt-in — only ``hard_mode=True`` routes to the hosted model in practice.

The actual HTTP call stays inside ``apps.api.ai.ollama_client`` — ``chat_with_tools``
calls ``resolve_model()`` itself. Here we only decide *which* model to prefer
and expose a ``select_model(...)`` helper. When a hosted model is chosen we
set a contextvar for the scope of the turn (thread-safe, unlike os.environ).
"""

from __future__ import annotations

import os
from contextvars import ContextVar
from contextlib import contextmanager
from typing import Iterator


# Thread-safe override for the current Ollama model.  When set, ``resolve_model()``
# in ``apps.api.ai.ollama_client`` should read this instead of ``os.environ``.
_ollama_model_override: ContextVar[str | None] = ContextVar("ollama_model_override", default=None)


HARD_MODE_TOOL_THRESHOLD = 999  # effectively opt-in: only hard_mode=True routes to the hosted model


def select_model(*, tool_count: int, hard_mode: bool = False) -> tuple[str, str]:
    """Return ``(provider, model)`` for this turn.

    This does NOT change any global state — it just indicates the preference.
    The caller uses :func:`scoped_model` to actually set the contextvar.
    """
    hosted_enabled = (os.getenv("AGENT_HOSTED_ENABLED") or "").lower() in ("1", "true", "yes")
    hosted_model = os.getenv("AGENT_HOSTED_MODEL") or ""
    ollama_model = os.getenv("OLLAMA_MODEL") or ""

    want_hard = hard_mode or tool_count >= HARD_MODE_TOOL_THRESHOLD
    if want_hard and hosted_enabled and hosted_model:
        return "hosted", hosted_model
    return "ollama", ollama_model or "local-fallback"


@contextmanager
def scoped_model(model: str) -> Iterator[None]:
    """Temporarily set the Ollama model for the duration of the context.

    Uses a ``ContextVar`` instead of ``os.environ`` so that concurrent requests
    in different threads/coroutines don't clobber each other's model selection.
    ``resolve_model()`` in ``ollama_client`` should call ``get_model_override()``
    to pick this up.
    """
    token = _ollama_model_override.set(model)
    try:
        yield
    finally:
        _ollama_model_override.reset(token)


def get_model_override() -> str | None:
    """Return the current thread-local model override, or None."""
    return _ollama_model_override.get()
