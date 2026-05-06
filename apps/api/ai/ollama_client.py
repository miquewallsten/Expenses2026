"""
LLM client — transport layer for all chat calls.

Supports three backends:
  - OpenAI-compatible Chat Completions (Ollama Cloud, NVIDIA NIM, OpenAI, Together, Groq)
  - Anthropic Messages API (Claude models)
  - Ollama native (`/api/chat`) for local

Selection is driven by LLM_* env vars.

Public API:
    chat_with_ollama(system, user, ...)         -> dict
    chat_with_messages(messages, ...)           -> dict
    chat_with_tools(system, user, tools, fn)    -> dict
    stream_chat_sse(system, user, ...)          -> generator of SSE frames
    stream_chat_with_messages_sse(messages,...) -> generator of SSE frames
    list_models()  resolve_model()  is_available()

All callsites receive a normalised result dict:
    { "ok": bool, "model": str | None, "content": str, "error": str | None }

Env vars:
    LLM_PROVIDER             "openai" (default) | "ollama" | "anthropic"
    LLM_BASE_URL             e.g. https://ollama.com/v1
    LLM_API_KEY              bearer token
    LLM_MODEL                model id (e.g. glm-5:cloud, deepseek-v3.2:cloud)
    LLM_NUM_CTX              context size (ollama option)
    LLM_MAX_OUTPUT_TOKENS    output cap (default 16384)

Backwards compatibility: OLLAMA_BASE_URL / OLLAMA_MODEL / OLLAMA_NUM_CTX
are still read as defaults when LLM_* vars are not set.
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
    kind: str            # "openai" | "ollama" | "anthropic"
    base_url: str        # base URL, no trailing slash
    model: str           # model id
    api_key: str = ""    # bearer (openai / anthropic)
    num_ctx: int = 32768 # ollama option


def _build_primary() -> Provider | None:
    kind = (os.getenv("LLM_PROVIDER") or "").strip().lower()

    # When no provider is explicitly configured, prefer Ollama if it is reachable.
    if not kind:
        base = (os.getenv("OLLAMA_BASE_URL") or "http://127.0.0.1:11434").rstrip("/")
        model = os.getenv("OLLAMA_MODEL") or ""
        if not model:
            # Auto-detect first available model from local Ollama
            try:
                r = requests.get(f"{base}/api/tags", timeout=3)
                r.raise_for_status()
                models = r.json().get("models", [])
                if models:
                    model = models[0]["name"]
            except Exception:
                pass
        if model:
            return Provider(
                kind="ollama",
                base_url=base,
                model=model,
                num_ctx=int(os.getenv("LLM_NUM_CTX") or os.getenv("OLLAMA_NUM_CTX", "32768")),
            )
        # Ollama not available — fall through to legacy openai default
        kind = "openai"

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
    if kind == "anthropic":
        base = (os.getenv("LLM_BASE_URL") or "https://api.anthropic.com").rstrip("/")
        model = os.getenv("LLM_MODEL") or ""
        if not model:
            return None
        return Provider(
            kind="anthropic",
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
        api_key=os.getenv("LLM_API_KEY") or "",
        num_ctx=int(os.getenv("LLM_NUM_CTX") or os.getenv("OLLAMA_NUM_CTX", "32768")),
    )


# Lazy initialization to allow dotenv to load first
_PROVIDER: Provider | None = None
_INITIALIZED = False


def _ensure_initialized() -> None:
    """Build provider on first use (after dotenv has loaded)."""
    global _PROVIDER, _INITIALIZED
    if _INITIALIZED:
        return
    _PROVIDER = _build_primary()
    _INITIALIZED = True


def _get_provider() -> Provider | None:
    _ensure_initialized()
    return _PROVIDER


# Legacy module-level constants (consumed by ai/routes.py:/ai/status, tests).
OLLAMA_BASE_URL: str = ""
OLLAMA_MODEL: str = ""
OLLAMA_NUM_CTX: int = 32768


def _sync_legacy_constants() -> None:
    """Update legacy constants after initialization."""
    global OLLAMA_BASE_URL, OLLAMA_MODEL, OLLAMA_NUM_CTX
    p = _get_provider()
    OLLAMA_BASE_URL = p.base_url if p else "http://127.0.0.1:11434"
    OLLAMA_MODEL = p.model if p else ""
    OLLAMA_NUM_CTX = p.num_ctx if p else 32768


# ── HTTP helpers ─────────────────────────────────────────────────────────────

def _chat_url(p: Provider) -> str:
    if p.kind == "openai":
        if p.base_url.endswith("/chat/completions") or p.base_url.endswith("/responses"):
            return p.base_url
        return f"{p.base_url}/chat/completions"
    if p.kind == "anthropic":
        if p.base_url.endswith("/v1/messages"):
            return p.base_url
        return f"{p.base_url}/v1/messages"
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
    if p.kind == "anthropic":
        h = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream" if stream else "application/json",
            "anthropic-version": "2023-06-01",
        }
        if p.api_key:
            h["x-api-key"] = p.api_key
        return h
    # Ollama native — also supports Bearer token for Ollama Cloud
    h = {"Content-Type": "application/json"}
    if p.api_key:
        h["Authorization"] = f"Bearer {p.api_key}"
    return h


def _openai_tools_to_anthropic(tools: list[dict]) -> list[dict]:
    """Convert OpenAI-style tool definitions to Anthropic format."""
    out: list[dict] = []
    for t in tools:
        fn = t.get("function", {}) if t.get("type") == "function" else t
        out.append({
            "name": fn.get("name", ""),
            "description": fn.get("description", ""),
            "input_schema": fn.get("parameters", {"type": "object", "properties": {}}),
        })
    return out


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
    if p.kind == "anthropic":
        # Anthropic requires system as top-level param, not in messages
        system_msg = ""
        chat_msgs: list[dict] = []
        for m in messages:
            if m.get("role") == "system":
                system_msg = m.get("content", "")
            else:
                chat_msgs.append(m)
        payload = {
            "model": p.model,
            "messages": chat_msgs,
            "max_tokens": int(os.getenv("LLM_MAX_OUTPUT_TOKENS", "4096")),
            "stream": stream,
        }
        if system_msg:
            payload["system"] = system_msg
        if temperature is not None:
            payload["temperature"] = temperature
        if top_p is not None:
            payload["top_p"] = top_p
        if tools:
            payload["tools"] = _openai_tools_to_anthropic(tools)
            payload["tool_choice"] = {"type": "auto"}
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


def _anthropic_normalize(data: dict) -> dict:
    """Convert Anthropic response to OpenAI-style dict for uniform handling."""
    content_blocks = data.get("content") or []
    text_parts: list[str] = []
    tool_calls: list[dict] = []
    for block in content_blocks:
        if block.get("type") == "text":
            text_parts.append(block.get("text", ""))
        elif block.get("type") == "tool_use":
            tool_calls.append({
                "id": block.get("id", ""),
                "type": "function",
                "function": {
                    "name": block.get("name", ""),
                    "arguments": json.dumps(block.get("input", {})),
                },
            })
    return {
        "content": "\n".join(text_parts),
        "tool_calls": tool_calls if tool_calls else None,
    }


def _extract_content(data: dict) -> str:
    # Anthropic native format
    if data.get("type") == "message" and "content" in data:
        return _anthropic_normalize(data).get("content", "")
    choices = data.get("choices")
    if isinstance(choices, list) and choices:
        msg = choices[0].get("message", {}) or {}
        # GLM-5 reasoning models: prefer content, fall back to reasoning
        content = msg.get("content") or ""
        reasoning = msg.get("reasoning") or ""
        return content if content else reasoning
    return data.get("message", {}).get("content") or data.get("content") or ""


def _extract_message(data: dict) -> dict:
    # Anthropic native format
    if data.get("type") == "message" and "content" in data:
        return _anthropic_normalize(data)
    choices = data.get("choices")
    if isinstance(choices, list) and choices:
        msg = choices[0].get("message", {}) or {}
        # GLM-5 reasoning models: prefer content, fall back to reasoning
        content = msg.get("content") or ""
        reasoning = msg.get("reasoning") or ""
        if not content and reasoning:
            msg = dict(msg)
            msg["content"] = reasoning
        return msg
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

    if p.kind == "anthropic":
        for raw in resp.iter_lines(decode_unicode=True):
            if not raw:
                continue
            line = raw.strip()
            if line.startswith("event:"):
                continue
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if not payload:
                continue
            try:
                chunk = json.loads(payload)
            except json.JSONDecodeError:
                continue
            if chunk.get("type") == "content_block_delta":
                delta = chunk.get("delta", {})
                if delta.get("type") == "text_delta":
                    text = delta.get("text", "")
                    if text:
                        yield text
            elif chunk.get("type") == "message_delta":
                if chunk.get("delta", {}).get("stop_reason"):
                    return
            elif chunk.get("type") == "message_stop":
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
    """Return available model names from the provider."""
    _ensure_initialized()
    if _PROVIDER is None:
        return []
    p = _PROVIDER
    try:
        if p.kind == "openai":
            base = p.base_url
            if base.endswith("/chat/completions") or base.endswith("/responses"):
                base = base.rsplit("/", 1)[0]
            response = requests.get(f"{base}/models", headers=_headers(p, False), timeout=10)
            response.raise_for_status()
            data = response.json()
            return [m["id"] for m in data.get("data", []) if isinstance(m, dict) and "id" in m]
        if p.kind == "anthropic":
            # Anthropic does not expose a public models list endpoint; return known models
            return [
                "claude-sonnet-4-6",
                "claude-opus-4-7",
                "claude-haiku-4-5-20251001",
                "claude-3-5-sonnet-20241022",
                "claude-3-opus-20240229",
                "claude-3-haiku-20240307",
            ]
        response = requests.get(f"{p.base_url}/api/tags", timeout=5)
        response.raise_for_status()
        data = response.json()
        return [m["name"] for m in (data.get("models") or []) if isinstance(m, dict) and "name" in m]
    except Exception:
        return []


def resolve_model() -> str | None:
    _ensure_initialized()
    return _PROVIDER.model if _PROVIDER else None


def is_available() -> bool:
    _ensure_initialized()
    return _PROVIDER is not None


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


# ── Non-streaming ────────────────────────────────────────────────────────────

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


def _chat_single(
    *,
    messages: list[dict],
    temperature: float,
    top_p: float | None = None,
    num_ctx: int | None = None,
) -> dict:
    provider = _get_provider()
    if not provider:
        return _not_configured()

    try:
        data = _post_chat(
            provider, messages=messages, temperature=temperature,
            top_p=top_p, num_ctx=num_ctx,
        )
        return {"ok": True, "model": provider.model, "content": _extract_content(data), "error": None}
    except Exception as exc:
        log.error("LLM '%s' (%s) failed: %s", provider.kind, provider.model, exc)
        return _error_result(provider.model, exc)


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
    return _chat_single(
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
    return _chat_single(
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
    """Agentic tool-use loop against the configured provider."""
    provider = _get_provider()
    if not provider:
        return _not_configured()

    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_prompt},
    ]
    try:
        for _ in range(max_iterations):
            payload = _build_payload(
                provider, messages=messages, temperature=temperature,
                num_ctx=num_ctx, stream=False, tools=tools,
            )
            response = requests.post(
                _chat_url(provider), json=payload, headers=_headers(provider, False), timeout=300,
            )
            response.raise_for_status()
            data = response.json()
            msg = _extract_message(data)

            tool_calls = msg.get("tool_calls") or []
            content    = msg.get("content", "") or ""

            if not tool_calls:
                return {"ok": True, "model": provider.model, "content": content, "error": None}

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
            provider, messages=messages, temperature=temperature, top_p=None, num_ctx=num_ctx,
        )
        return {"ok": True, "model": provider.model, "content": _extract_content(data), "error": None}

    except Exception as exc:
        log.error("LLM tool loop on '%s' (%s) failed: %s", provider.kind, provider.model, exc)
        return _error_result(provider.model, exc)


# ── SSE streaming ─────────────────────────────────────────────────────────────

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


def _stream_single(
    *,
    messages: list[dict],
    temperature: float,
    num_ctx: int | None,
) -> Generator[str, None, None]:
    """Yield SSE-frame strings from the configured provider."""
    provider = _get_provider()
    if not provider:
        yield f"data: {json.dumps({'error': 'No LLM model configured'})}\n\n"
        yield "data: [DONE]\n\n"
        return

    try:
        for text in _stream_one(
            provider, messages=messages, temperature=temperature, num_ctx=num_ctx,
        ):
            yield f"data: {json.dumps({'text': text})}\n\n"
        yield "data: [DONE]\n\n"
    except Exception as exc:
        log.error("LLM stream on '%s' failed: %s", provider.kind, exc)
        yield f"data: {json.dumps({'error': str(exc)})}\n\n"
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
    yield from _stream_single(
        messages=messages, temperature=temperature, num_ctx=num_ctx,
    )


def stream_chat_with_messages_sse(
    messages: list[dict],
    temperature: float = 0.5,
    num_ctx: int | None = None,
) -> Generator[str, None, None]:
    """Multi-turn SSE streaming. Same SSE format as stream_chat_sse()."""
    yield from _stream_single(
        messages=messages, temperature=temperature, num_ctx=num_ctx,
    )


# ── Dynamic provider config (model-agnostic agent platform) ───────────────────

def provider_from_config(config: dict) -> Provider | None:
    """Build a Provider from an LLMProviderConfig dict."""
    kind = config.get("provider", "ollama").strip().lower()
    # Map ollama-cloud to ollama (same API, different base URL)
    if kind == "ollama-cloud":
        kind = "ollama"
    model = config.get("model_name", "")
    if not model:
        return None
    # Resolve API key from env var reference
    api_key = ""
    env_ref = config.get("api_key_env_ref", "")
    if env_ref:
        api_key = os.environ.get(env_ref, "")
    return Provider(
        kind=kind,
        base_url=(config.get("base_url") or "").rstrip("/") or "http://127.0.0.1:11434",
        model=model,
        api_key=api_key,
        num_ctx=int(config.get("num_ctx") or 32768),
    )


def chat_with_tools_dynamic(
    system_prompt: str,
    user_prompt: str,
    tools: list[dict],
    tool_executor: Any,
    provider: Provider,
    temperature: float = 0.3,
    num_ctx: int | None = None,
    max_iterations: int = 6,
) -> dict:
    """Agentic tool-use loop against an explicit provider (no env vars)."""
    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    try:
        for _ in range(max_iterations):
            payload = _build_payload(
                provider, messages=messages, temperature=temperature,
                num_ctx=num_ctx, stream=False, tools=tools,
            )
            response = requests.post(
                _chat_url(provider), json=payload, headers=_headers(provider, False), timeout=300,
            )
            response.raise_for_status()
            data = response.json()
            msg = _extract_message(data)

            tool_calls = msg.get("tool_calls") or []
            content = msg.get("content", "") or ""

            if not tool_calls:
                return {"ok": True, "model": provider.model, "content": content, "error": None}

            messages.append({"role": "assistant", "content": content, "tool_calls": tool_calls})

            for tc in tool_calls:
                fn = tc.get("function", {})
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
            provider, messages=messages, temperature=temperature, top_p=None, num_ctx=num_ctx,
        )
        return {"ok": True, "model": provider.model, "content": _extract_content(data), "error": None}
    except Exception as exc:
        log.warning("LLM tool loop on '%s' (%s) failed: %s", provider.kind, provider.model, exc)
        return _error_result(provider.model, exc)


def chat_with_messages_dynamic(
    messages: list[dict],
    provider: Provider,
    temperature: float = 0.5,
    top_p: float | None = None,
    num_ctx: int | None = None,
) -> dict:
    """Multi-turn chat against an explicit provider (no env vars)."""
    try:
        data = _post_chat(
            provider, messages=messages, temperature=temperature, top_p=top_p, num_ctx=num_ctx,
        )
        return {"ok": True, "model": provider.model, "content": _extract_content(data), "error": None}
    except Exception as exc:
        log.warning("LLM chat on '%s' (%s) failed: %s", provider.kind, provider.model, exc)
        return _error_result(provider.model, exc)
