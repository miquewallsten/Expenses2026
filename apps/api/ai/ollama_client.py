"""
LLM client — transport layer for all chat calls.

Supports two backends with automatic failover:
  - OpenAI-compatible Chat Completions (NVIDIA NIM, OpenAI, Together, Groq)
  - Ollama native (`/api/chat`) for local fallback

Selection is driven by env vars. Primary provider is configured via LLM_*;
fallback (if any) via LLM_FALLBACK_*. When a primary call raises, the client
transparently retries against the fallback.

Public API (unchanged):
    chat_with_ollama(system, user, ...)         -> dict
    chat_with_messages(messages, ...)           -> dict
    chat_with_tools(system, user, tools, fn)    -> dict
    stream_chat_sse(system, user, ...)          -> generator of SSE frames
    stream_chat_with_messages_sse(messages,...) -> generator of SSE frames
    list_models()  resolve_model()  is_available()

All callsites receive a normalised result dict:
    { "ok": bool, "model": str | None, "content": str, "error": str | None }

Env vars:
    LLM_PROVIDER             "openai" (default) | "ollama"
    LLM_BASE_URL             e.g. https://integrate.api.nvidia.com/v1
    LLM_API_KEY              bearer token (openai-compatible only)
    LLM_MODEL                model id
    LLM_NUM_CTX              context size (ollama option)
    LLM_MAX_OUTPUT_TOKENS    output cap for openai-compatible (default 16384)

    LLM_FALLBACK_PROVIDER    "ollama" | "openai" — enables failover when set
    LLM_FALLBACK_BASE_URL    fallback base URL
    LLM_FALLBACK_API_KEY     fallback bearer token
    LLM_FALLBACK_MODEL       fallback model id

Backwards compatibility: OLLAMA_BASE_URL / OLLAMA_MODEL / OLLAMA_NUM_CTX
are still read as defaults for the Ollama side (primary OR fallback).
"""

from __future__ import annotations

import json
import logging
import os
from collections.abc import Generator
from dataclasses import dataclass
from typing import Any

import requests

log = logging.getLogger(__name__)


# ── Provider config ──────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Provider:
    kind: str            # "openai" or "ollama"
    base_url: str        # base URL, no trailing slash
    model: str           # model id
    api_key: str = ""    # bearer (openai only)
    num_ctx: int = 32768 # ollama option


def _build_primary() -> Provider | None:
    kind = (os.getenv("LLM_PROVIDER") or "openai").strip().lower()
    if kind == "openai":
        base = (os.getenv("LLM_BASE_URL") or "").rstrip("/")
        model = os.getenv("LLM_MODEL") or ""
        if not (base and model):
            return None
        return Provider(
            kind="openai",
            base_url=base,
            model=model,
            api_key=os.getenv("LLM_API_KEY") or "",
        )
    base = (os.getenv("LLM_BASE_URL") or os.getenv("OLLAMA_BASE_URL") or "http://127.0.0.1:11434").rstrip("/")
    model = os.getenv("LLM_MODEL") or os.getenv("OLLAMA_MODEL") or ""
    if not model:
        return None
    return Provider(
        kind="ollama",
        base_url=base,
        model=model,
        num_ctx=int(os.getenv("LLM_NUM_CTX") or os.getenv("OLLAMA_NUM_CTX", "32768")),
    )


def _build_fallback() -> Provider | None:
    kind = (os.getenv("LLM_FALLBACK_PROVIDER") or "").strip().lower()
    if not kind:
        return None
    if kind == "openai":
        base = (os.getenv("LLM_FALLBACK_BASE_URL") or "").rstrip("/")
        model = os.getenv("LLM_FALLBACK_MODEL") or ""
        if not (base and model):
            return None
        return Provider(
            kind="openai",
            base_url=base,
            model=model,
            api_key=os.getenv("LLM_FALLBACK_API_KEY") or "",
        )
    base = (os.getenv("LLM_FALLBACK_BASE_URL") or os.getenv("OLLAMA_BASE_URL") or "http://127.0.0.1:11434").rstrip("/")
    model = os.getenv("LLM_FALLBACK_MODEL") or os.getenv("OLLAMA_MODEL") or ""
    if not model:
        return None
    return Provider(
        kind="ollama",
        base_url=base,
        model=model,
        num_ctx=int(os.getenv("LLM_NUM_CTX") or os.getenv("OLLAMA_NUM_CTX", "32768")),
    )


_PRIMARY:  Provider | None = _build_primary()
_FALLBACK: Provider | None = _build_fallback()


def _providers() -> list[Provider]:
    return [p for p in (_PRIMARY, _FALLBACK) if p is not None]


# Legacy module-level constants (consumed by ai/routes.py:/ai/status, tests).
OLLAMA_BASE_URL: str = (_PRIMARY.base_url if _PRIMARY else "http://127.0.0.1:11434")
OLLAMA_MODEL: str    = (_PRIMARY.model if _PRIMARY else "")
OLLAMA_NUM_CTX: int  = (_PRIMARY.num_ctx if _PRIMARY else 32768)


# ── HTTP helpers ─────────────────────────────────────────────────────────────

def _chat_url(p: Provider) -> str:
    if p.kind == "openai":
        if p.base_url.endswith("/chat/completions") or p.base_url.endswith("/responses"):
            return p.base_url
        return f"{p.base_url}/chat/completions"
    return f"{p.base_url}/api/chat"


def _headers(p: Provider, stream: bool) -> dict[str, str]:
    if p.kind == "openai":
        h = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream" if stream else "application/json",
        }
        if p.api_key:
            h["Authorization"] = f"Bearer {p.api_key}"
        return h
    return {"Content-Type": "application/json"}


def _build_payload(
    p: Provider,
    *,
    messages: list[dict],
    temperature: float,
    top_p: float | None = None,
    num_ctx: int | None = None,
    stream: bool = False,
    tools: list[dict] | None = None,
) -> dict:
    if p.kind == "openai":
        payload: dict[str, Any] = {
            "model": p.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": int(os.getenv("LLM_MAX_OUTPUT_TOKENS", "16384")),
            "stream": stream,
        }
        if top_p is not None:
            payload["top_p"] = top_p
        if tools:
            payload["tools"] = tools
        return payload
    options: dict[str, Any] = {
        "temperature": temperature,
        "num_ctx": num_ctx or p.num_ctx,
    }
    if top_p is not None:
        options["top_p"] = top_p
    payload = {
        "model": p.model,
        "messages": messages,
        "stream": stream,
        "options": options,
    }
    if tools:
        payload["tools"] = tools
    return payload


def _extract_content(data: dict) -> str:
    choices = data.get("choices")
    if isinstance(choices, list) and choices:
        msg = choices[0].get("message", {}) or {}
        return msg.get("content") or ""
    return data.get("message", {}).get("content") or data.get("content") or ""


def _extract_message(data: dict) -> dict:
    choices = data.get("choices")
    if isinstance(choices, list) and choices:
        return choices[0].get("message", {}) or {}
    return data.get("message", {}) or {}


def _iter_stream_text(p: Provider, resp: requests.Response) -> Generator[str, None, None]:
    if p.kind == "openai":
        for raw in resp.iter_lines(decode_unicode=True):
            if not raw:
                continue
            line = raw.strip()
            if line.startswith(":"):
                continue
            if line.startswith("data:"):
                line = line[5:].strip()
            if not line:
                continue
            if line == "[DONE]":
                return
            try:
                chunk = json.loads(line)
            except json.JSONDecodeError:
                continue
            choices = chunk.get("choices") or []
            if not choices:
                continue
            delta = choices[0].get("delta") or {}
            text = delta.get("content") or ""
            if text:
                yield text
            if choices[0].get("finish_reason"):
                return
        return

    for raw in resp.iter_lines():
        if not raw:
            continue
        try:
            chunk = json.loads(raw)
        except json.JSONDecodeError:
            continue
        text = chunk.get("message", {}).get("content", "")
        if text:
            yield text
        if chunk.get("done"):
            return


# ── Public meta ──────────────────────────────────────────────────────────────

def list_models() -> list[str]:
    """Return available model names from the primary provider."""
    if _PRIMARY is None:
        return []
    p = _PRIMARY
    try:
        if p.kind == "openai":
            base = p.base_url
            if base.endswith("/chat/completions") or base.endswith("/responses"):
                base = base.rsplit("/", 1)[0]
            response = requests.get(f"{base}/models", headers=_headers(p, False), timeout=10)
            response.raise_for_status()
            data = response.json()
            return [m["id"] for m in data.get("data", []) if isinstance(m, dict) and "id" in m]
        response = requests.get(f"{p.base_url}/api/tags", timeout=5)
        response.raise_for_status()
        data = response.json()
        return [m["name"] for m in (data.get("models") or []) if isinstance(m, dict) and "name" in m]
    except Exception:
        return []


def resolve_model() -> str | None:
    return _PRIMARY.model if _PRIMARY else None


def is_available() -> bool:
    return bool(_providers())


def _not_configured() -> dict:
    return {
        "ok": False, "model": None,
        "content": "No LLM model is available.",
        "error": "No model available",
    }


def _error_result(model: str | None, exc: Exception | None) -> dict:
    log.error("LLM error (%s): %s", model, exc)
    return {
        "ok": False, "model": model,
        "content": "LLM provider is not reachable.",
        "error": str(exc) if exc else "unknown error",
    }


# ── Non-streaming with failover ──────────────────────────────────────────────

def _post_chat(
    p: Provider,
    *,
    messages: list[dict],
    temperature: float,
    top_p: float | None,
    num_ctx: int | None,
    tools: list[dict] | None = None,
) -> dict:
    payload = _build_payload(
        p, messages=messages, temperature=temperature,
        top_p=top_p, num_ctx=num_ctx, stream=False, tools=tools,
    )
    response = requests.post(
        _chat_url(p), json=payload, headers=_headers(p, False), timeout=300,
    )
    response.raise_for_status()
    return response.json()


def _chat_with_failover(
    *,
    messages: list[dict],
    temperature: float,
    top_p: float | None = None,
    num_ctx: int | None = None,
) -> dict:
    providers = _providers()
    if not providers:
        return _not_configured()

    last_exc: Exception | None = None
    last_model: str | None = None
    for p in providers:
        last_model = p.model
        try:
            data = _post_chat(
                p, messages=messages, temperature=temperature,
                top_p=top_p, num_ctx=num_ctx,
            )
            return {"ok": True, "model": p.model, "content": _extract_content(data), "error": None}
        except Exception as exc:
            last_exc = exc
            log.warning("LLM '%s' (%s) failed: %s — trying next", p.kind, p.model, exc)

    return _error_result(last_model, last_exc)


# ── Single-turn chat ────────────────────────────────────────────────────────

def chat_with_ollama(
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.5,
    top_p: float = 0.9,
    num_ctx: int | None = None,
) -> dict:
    """Single-turn chat. Returns { ok, model, content, error }."""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_prompt},
    ]
    return _chat_with_failover(
        messages=messages, temperature=temperature, top_p=top_p, num_ctx=num_ctx,
    )


# ── Multi-turn chat ─────────────────────────────────────────────────────────

def chat_with_messages(
    messages: list[dict],
    temperature: float = 0.5,
    top_p: float = 0.9,
    num_ctx: int | None = None,
) -> dict:
    """Multi-turn chat. Returns { ok, model, content, error }."""
    return _chat_with_failover(
        messages=messages, temperature=temperature, top_p=top_p, num_ctx=num_ctx,
    )


# ── Tool use (agentic loop) ─────────────────────────────────────────────────

def chat_with_tools(
    system_prompt: str,
    user_prompt: str,
    tools: list[dict],
    tool_executor: Any,
    temperature: float = 0.3,
    num_ctx: int | None = None,
    max_iterations: int = 6,
) -> dict:
    """
    Agentic tool-use loop. The whole loop runs against a single provider —
    if the primary fails on the first call we restart the loop on the fallback.
    """
    providers = _providers()
    if not providers:
        return _not_configured()

    last_exc: Exception | None = None
    last_model: str | None = None

    for p in providers:
        last_model = p.model
        messages: list[dict] = [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ]
        try:
            for _ in range(max_iterations):
                payload = _build_payload(
                    p, messages=messages, temperature=temperature,
                    num_ctx=num_ctx, stream=False, tools=tools,
                )
                response = requests.post(
                    _chat_url(p), json=payload, headers=_headers(p, False), timeout=300,
                )
                response.raise_for_status()
                data = response.json()
                msg = _extract_message(data)

                tool_calls = msg.get("tool_calls") or []
                content    = msg.get("content", "") or ""

                if not tool_calls:
                    return {"ok": True, "model": p.model, "content": content, "error": None}

                messages.append({"role": "assistant", "content": content, "tool_calls": tool_calls})

                for tc in tool_calls:
                    fn   = tc.get("function", {})
                    name = fn.get("name", "")
                    args = fn.get("arguments", {})
                    if isinstance(args, str):
                        try:
                            args = json.loads(args)
                        except Exception:
                            args = {}
                    try:
                        result = tool_executor(name, args)
                    except Exception as exc:
                        result = f"Tool error: {exc}"
                        log.warning("Tool '%s' raised: %s", name, exc)
                    messages.append({"role": "tool", "content": str(result)})

            messages.append({
                "role": "user",
                "content": "Based on everything gathered, provide your final answer now.",
            })
            data = _post_chat(
                p, messages=messages, temperature=temperature, top_p=None, num_ctx=num_ctx,
            )
            return {"ok": True, "model": p.model, "content": _extract_content(data), "error": None}

        except Exception as exc:
            last_exc = exc
            log.warning("LLM tool loop on '%s' (%s) failed: %s — trying next", p.kind, p.model, exc)

    return _error_result(last_model, last_exc)


# ── SSE streaming with failover ─────────────────────────────────────────────

def _stream_one(
    p: Provider,
    *,
    messages: list[dict],
    temperature: float,
    num_ctx: int | None,
) -> Generator[str, None, None]:
    payload = _build_payload(
        p, messages=messages, temperature=temperature, num_ctx=num_ctx, stream=True,
    )
    with requests.post(
        _chat_url(p), json=payload, headers=_headers(p, True),
        stream=True, timeout=300,
    ) as resp:
        resp.raise_for_status()
        for text in _iter_stream_text(p, resp):
            if text:
                yield text


def _stream_with_failover(
    *,
    messages: list[dict],
    temperature: float,
    num_ctx: int | None,
) -> Generator[str, None, None]:
    """Yield SSE-frame strings, falling back to the next provider only if the
    primary fails BEFORE producing any text."""
    providers = _providers()
    if not providers:
        yield f"data: {json.dumps({'error': 'No LLM model configured'})}\n\n"
        yield "data: [DONE]\n\n"
        return

    last_exc: Exception | None = None
    streamed = False
    for p in providers:
        try:
            for text in _stream_one(
                p, messages=messages, temperature=temperature, num_ctx=num_ctx,
            ):
                streamed = True
                yield f"data: {json.dumps({'text': text})}\n\n"
            yield "data: [DONE]\n\n"
            return
        except Exception as exc:
            last_exc = exc
            if streamed:
                log.error("LLM stream broke mid-stream on '%s': %s", p.kind, exc)
                yield f"data: {json.dumps({'error': str(exc)})}\n\n"
                yield "data: [DONE]\n\n"
                return
            log.warning("LLM stream init on '%s' (%s) failed: %s — trying next", p.kind, p.model, exc)

    yield f"data: {json.dumps({'error': str(last_exc) if last_exc else 'all providers failed'})}\n\n"
    yield "data: [DONE]\n\n"


def stream_chat_sse(
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.5,
    num_ctx: int | None = None,
) -> Generator[str, None, None]:
    """SSE streaming generator (single-turn). Each yield: 'data: {...}\\n\\n'."""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_prompt},
    ]
    yield from _stream_with_failover(
        messages=messages, temperature=temperature, num_ctx=num_ctx,
    )


def stream_chat_with_messages_sse(
    messages: list[dict],
    temperature: float = 0.5,
    num_ctx: int | None = None,
) -> Generator[str, None, None]:
    """Multi-turn SSE streaming. Same SSE format as stream_chat_sse()."""
    yield from _stream_with_failover(
        messages=messages, temperature=temperature, num_ctx=num_ctx,
    )
