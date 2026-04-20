import os

import requests

OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "")


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
    """Return the configured model name, or the first available one, or None."""
    if OLLAMA_MODEL:
        return OLLAMA_MODEL
    available = list_models()
    return available[0] if available else None


def chat_with_ollama(system_prompt: str, user_prompt: str) -> dict:
    """
    Send a chat request to Ollama and return a normalised result dict.

    Returns:
        {
            "ok": bool,
            "model": str | None,
            "content": str,
            "error": str | None,
        }
    """
    model = resolve_model()

    if model is None:
        return {
            "ok": False,
            "model": None,
            "content": "No Ollama model is available.",
            "error": "No model available",
        }

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
    }

    try:
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
            timeout=120,
        )
        response.raise_for_status()
        data = response.json()
        content = (
            data.get("message", {}).get("content")
            or data.get("content")
            or ""
        )
        return {
            "ok": True,
            "model": model,
            "content": content,
            "error": None,
        }
    except Exception as exc:
        return {
            "ok": False,
            "model": model,
            "content": "Ollama is not reachable.",
            "error": str(exc),
        }


def chat_with_messages(messages: list[dict]) -> dict:
    """
    Send a multi-turn chat request to Ollama with a pre-built messages list.

    Each message is {"role": "system"|"user"|"assistant", "content": str}.

    Returns:
        {
            "ok": bool,
            "model": str | None,
            "content": str,
            "error": str | None,
        }
    """
    model = resolve_model()

    if model is None:
        return {
            "ok": False,
            "model": None,
            "content": "No Ollama model is available.",
            "error": "No model available",
        }

    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
    }

    try:
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
            timeout=120,
        )
        response.raise_for_status()
        data = response.json()
        content = (
            data.get("message", {}).get("content")
            or data.get("content")
            or ""
        )
        return {
            "ok": True,
            "model": model,
            "content": content,
            "error": None,
        }
    except Exception as exc:
        return {
            "ok": False,
            "model": model,
            "content": "Ollama is not reachable.",
            "error": str(exc),
        }
