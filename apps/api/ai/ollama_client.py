"""
Ollama AI client — transport layer for all LLM calls.

All callsites receive a normalised result dict:
    { "ok": bool, "model": str | None, "content": str, "error": str | None }

Capabilities:
  - Single-turn and multi-turn chat
  - Native tool use (Ollama /api/chat tools format, supported by DeepSeek and
    other capable models)
  - SSE streaming generator for FastAPI StreamingResponse
  - Temperature, top_p, and num_ctx tuning per call type
  - Graceful degradation — any failure returns ok=False with a safe fallback message
"""

from __future__ import annotations

import json
import logging
import os
from collections.abc import Generator
from typing import Any

import requests

log = logging.getLogger(__name__)

OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL: str    = os.getenv("OLLAMA_MODEL", "")
OLLAMA_NUM_CTX: int  = int(os.getenv("OLLAMA_NUM_CTX", "32768"))


def list_models() -> list[str]:
    """Return available model names from the local Ollama instance."""
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        response.raise_for_status()
        data = response.json()
        models = data.get("models") or []
        return [m["name"] for m in models if isinstance(m, dict) and "name" in m]
    except Exception:
        return []


def resolve_model() -> str | None:
    """Return the explicitly configured model name, or None if not set.

    Intentionally does NOT fall back to the first available model — if
    OLLAMA_MODEL is not configured the orchestrator uses deterministic fallback.
    """
    return OLLAMA_MODEL if OLLAMA_MODEL else None


def is_available() -> bool:
    return bool(resolve_model())


def _not_configured() -> dict:
    return {
        "ok": False, "model": None,
        "content": "No Ollama model is available.",
        "error": "No model available",
    }


def _error_result(model: str | None, exc: Exception) -> dict:
    log.error("Ollama error (%s): %s", model, exc)
    return {
        "ok": False, "model": model,
        "content": "Ollama is not reachable.",
        "error": str(exc),
    }


def _extract_content(data: dict) -> str:
    return (
        data.get("message", {}).get("content")
        or data.get("content")
        or ""
    )


# ── Single-turn chat ──────────────────────────────────────────────────────────

def chat_with_ollama(
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.5,
    top_p: float = 0.9,
    num_ctx: int | None = None,
) -> dict:
    """
    Single-turn chat.
    Returns { ok, model, content, error }.
    """
    model = resolve_model()
    if model is None:
        return _not_configured()

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        "stream": False,
        "options": {
            "temperature": temperature,
            "top_p":       top_p,
            "num_ctx":     num_ctx or OLLAMA_NUM_CTX,
        },
    }

    try:
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
            timeout=300,
        )
        response.raise_for_status()
        return {"ok": True, "model": model, "content": _extract_content(response.json()), "error": None}
    except Exception as exc:
        return _error_result(model, exc)


# ── Multi-turn chat ────────────────────────────────────────────────────────────

def chat_with_messages(
    messages: list[dict],
    temperature: float = 0.5,
    top_p: float = 0.9,
    num_ctx: int | None = None,
) -> dict:
    """
    Multi-turn chat. messages = [{"role": "system"|"user"|"assistant", "content": str}].
    Returns { ok, model, content, error }.
    """
    model = resolve_model()
    if model is None:
        return _not_configured()

    payload = {
        "model":    model,
        "messages": messages,
        "stream":   False,
        "options": {
            "temperature": temperature,
            "top_p":       top_p,
            "num_ctx":     num_ctx or OLLAMA_NUM_CTX,
        },
    }

    try:
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
            timeout=300,
        )
        response.raise_for_status()
        return {"ok": True, "model": model, "content": _extract_content(response.json()), "error": None}
    except Exception as exc:
        return _error_result(model, exc)


# ── Tool use (agentic loop) ───────────────────────────────────────────────────

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
    Agentic tool-use loop using Ollama's native tools API.

    The model decides which tools to call; tool_executor(name, args) is invoked
    for each tool_call block; results are injected back until the model produces
    a final text response or max_iterations is reached.

    tools:         list of OpenAI-compatible tool dicts:
                   { "type": "function", "function": { "name", "description", "parameters" } }
    tool_executor: callable(tool_name: str, tool_args: dict) -> str

    Returns { ok, model, content, error }.
    """
    model = resolve_model()
    if model is None:
        return _not_configured()

    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": user_prompt},
    ]

    try:
        for _ in range(max_iterations):
            payload = {
                "model":    model,
                "messages": messages,
                "tools":    tools,
                "stream":   False,
                "options": {
                    "temperature": temperature,
                    "num_ctx":     num_ctx or OLLAMA_NUM_CTX,
                },
            }
            response = requests.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json=payload,
                timeout=300,
            )
            response.raise_for_status()
            data = response.json()
            msg = data.get("message", {})

            tool_calls = msg.get("tool_calls") or []
            content    = msg.get("content", "") or ""

            # Model finished — no tool calls
            if not tool_calls:
                return {"ok": True, "model": model, "content": content, "error": None}

            # Append the assistant's turn (with tool_calls)
            messages.append({"role": "assistant", "content": content, "tool_calls": tool_calls})

            # Execute each tool and append results
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

        # Exhausted iterations — ask for a plain summary
        messages.append({
            "role": "user",
            "content": "Based on everything gathered, provide your final answer now.",
        })
        final = chat_with_messages(messages, temperature=temperature, num_ctx=num_ctx)
        return final

    except Exception as exc:
        return _error_result(model, exc)


# ── SSE streaming ─────────────────────────────────────────────────────────────

def stream_chat_sse(
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.5,
    num_ctx: int | None = None,
) -> Generator[str, None, None]:
    """
    Server-Sent Events streaming generator.

    Each yield is one SSE frame:
        'data: {"text": "...chunk..."}\n\n'
        'data: [DONE]\n\n'   ← terminal signal

    FastAPI callers: wrap in StreamingResponse(media_type="text/event-stream").
    Frontend: consume with the Fetch Streaming API (see AICopilotRail / MyWorkAssistant).
    """
    model = resolve_model()
    if model is None:
        yield f"data: {json.dumps({'error': 'No Ollama model configured'})}\n\n"
        yield "data: [DONE]\n\n"
        return

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        "stream": True,
        "options": {
            "temperature": temperature,
            "num_ctx":     num_ctx or OLLAMA_NUM_CTX,
        },
    }

    try:
        with requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
            stream=True,
            timeout=300,
        ) as resp:
            resp.raise_for_status()
            for raw_line in resp.iter_lines():
                if not raw_line:
                    continue
                try:
                    chunk = json.loads(raw_line)
                except json.JSONDecodeError:
                    continue
                text = chunk.get("message", {}).get("content", "")
                if text:
                    yield f"data: {json.dumps({'text': text})}\n\n"
                if chunk.get("done"):
                    break
    except Exception as exc:
        log.error("Ollama SSE streaming error: %s", exc)
        yield f"data: {json.dumps({'error': str(exc)})}\n\n"
    finally:
        yield "data: [DONE]\n\n"


def stream_chat_with_messages_sse(
    messages: list[dict],
    temperature: float = 0.5,
    num_ctx: int | None = None,
) -> Generator[str, None, None]:
    """
    Multi-turn SSE streaming. Same SSE format as stream_chat_sse().
    """
    model = resolve_model()
    if model is None:
        yield f"data: {json.dumps({'error': 'No Ollama model configured'})}\n\n"
        yield "data: [DONE]\n\n"
        return

    payload = {
        "model":   model,
        "messages": messages,
        "stream":   True,
        "options": {
            "temperature": temperature,
            "num_ctx":     num_ctx or OLLAMA_NUM_CTX,
        },
    }

    try:
        with requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
            stream=True,
            timeout=300,
        ) as resp:
            resp.raise_for_status()
            for raw_line in resp.iter_lines():
                if not raw_line:
                    continue
                try:
                    chunk = json.loads(raw_line)
                except json.JSONDecodeError:
                    continue
                text = chunk.get("message", {}).get("content", "")
                if text:
                    yield f"data: {json.dumps({'text': text})}\n\n"
                if chunk.get("done"):
                    break
    except Exception as exc:
        log.error("Ollama multi-turn SSE error: %s", exc)
        yield f"data: {json.dumps({'error': str(exc)})}\n\n"
    finally:
        yield "data: [DONE]\n\n"
