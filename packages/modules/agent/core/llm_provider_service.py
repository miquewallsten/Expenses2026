from __future__ import annotations

import json
import logging
import os
import time
import urllib.request
from typing import Any

from packages.modules.agent.models_definitions import LLMProviderConfig

log = logging.getLogger(__name__)


def _detect_ollama_model() -> tuple[str, str] | None:
    """Auto-detect Ollama URL and first available model."""
    base = (os.getenv("OLLAMA_BASE_URL") or "http://127.0.0.1:11434").rstrip("/")
    try:
        req = urllib.request.Request(f"{base}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            body = resp.read()
            models = json.loads(body).get("models", [])
            if models:
                return base, models[0]["name"]
    except Exception:
        pass
    return None


def _build_env_fallback() -> LLMProviderConfig:
    """Build fallback config from env vars or Ollama auto-detection."""
    kind = (os.getenv("LLM_PROVIDER") or "").strip().lower()

    if kind == "openai":
        base = (os.getenv("LLM_BASE_URL") or "").rstrip("/")
        model = os.getenv("LLM_MODEL") or ""
        if base and model:
            return LLMProviderConfig(provider="openai", model_name=model, base_url=base, is_active=True)

    if kind == "anthropic":
        base = (os.getenv("LLM_BASE_URL") or "https://api.anthropic.com").rstrip("/")
        model = os.getenv("LLM_MODEL") or ""
        if model:
            return LLMProviderConfig(provider="anthropic", model_name=model, base_url=base, is_active=True)

    # Prefer Ollama auto-detection when no provider is explicitly configured
    detected = _detect_ollama_model()
    if detected:
        base, model = detected
        return LLMProviderConfig(provider="ollama", model_name=model, base_url=base, is_active=True)

    # Ultimate hardcoded fallback
    return LLMProviderConfig(provider="ollama", model_name="llama3.2", is_active=True)


class LLMProviderService:
    """
    Resolves which LLM provider and model to use for a given request.
    Supports a global default with per-company overrides.
    """

    def _is_viable(self, config: LLMProviderConfig) -> bool:
        """Check whether a DB config can actually work for inference."""
        if not config.is_active:
            return False
        provider = (config.provider or "").lower()
        # Anthropic, OpenAI, and Ollama Cloud need an API key
        if provider in ("anthropic", "openai", "ollama-cloud"):
            key = self.resolve_api_key(config)
            if key:
                return True
            # No key: only viable if base_url is set and not localhost Ollama
            base = (config.base_url or "").rstrip("/")
            if base and "127.0.0.1" not in base and "localhost" not in base:
                return True
            log.warning("Skipping non-viable %s config (no API key, no custom base_url)", provider)
            return False
        return True

    def resolve_provider(self, db, company_id: int | None = None) -> LLMProviderConfig:
        """
        Resolution chain:
        1. Active company-specific config.
        2. Active global config.
        3. Env-driven fallback (auto-detects Ollama).
        """
        # 1. Try company override
        if company_id is not None:
            company_config = db.query(LLMProviderConfig).filter(
                LLMProviderConfig.company_id == company_id,
                LLMProviderConfig.is_active == True
            ).first()
            if company_config:
                return company_config

        # 2. Try global override
        global_config = db.query(LLMProviderConfig).filter(
            LLMProviderConfig.company_id == None,
            LLMProviderConfig.is_active == True
        ).first()
        if global_config:
            return global_config

        # 3. Env / auto-detect fallback
        return _build_env_fallback()

    def resolve_api_key(self, config: LLMProviderConfig) -> str | None:
        """
        Resolves the API key from the environment variable referenced in the config.
        Never stores raw keys in the database.
        """
        if not config.api_key_env_ref:
            return None
        
        return os.environ.get(config.api_key_env_ref)

    def upsert(self, db, data: dict) -> LLMProviderConfig:
        """
        Creates or updates an LLM provider configuration.
        Ensures only one active config per company (or one global).
        """
        company_id = data.get("company_id")
        
        # Find existing config for this company (or global)
        existing = db.query(LLMProviderConfig).filter(
            LLMProviderConfig.company_id == company_id
        ).first()

        if existing:
            for k, v in data.items():
                setattr(existing, k, v)
            config = existing
        else:
            config = LLMProviderConfig(
                company_id=company_id,
                provider=data.get("provider", "ollama"),
                base_url=data.get("base_url"),
                api_key_env_ref=data.get("api_key_env_ref"),
                model_name=data.get("model_name", "llama3.2"),
                is_active=data.get("is_active", True),
            )
            db.add(config)

        db.commit()
        return config

    def test_connection(self, data: dict) -> dict:
        """Best-effort connectivity check for an LLM provider config.

        Returns {ok: bool, detail: str, latency_ms: int}.
        """
        provider = data.get("provider", "ollama")
        base_url = (data.get("base_url") or "http://localhost:11434").rstrip("/")
        model = data.get("model_name", "llama3.2")

        started = time.monotonic()
        try:
            # ollama and ollama-cloud use the same native API
            if provider in ("ollama", "ollama-cloud"):
                # For ollama-cloud, we can't list models remotely, just return success
                if provider == "ollama-cloud":
                    latency_ms = int((time.monotonic() - started) * 1000)
                    return {
                        "ok": True,
                        "detail": f"Ollama Cloud configured with model {model!r}.",
                        "latency_ms": latency_ms,
                    }
                # Local ollama - check if model exists
                req = urllib.request.Request(
                    f"{base_url}/api/tags",
                    method="GET",
                )
                with urllib.request.urlopen(req, timeout=5.0) as resp:
                    body = resp.read()
                    models = [t.get("name") for t in json.loads(body).get("models", [])]
                    latency_ms = int((time.monotonic() - started) * 1000)
                    return {
                        "ok": model in models,
                        "detail": f"Ollama online; {len(models)} model(s) found."
                                  + (" Model present." if model in models else f" Model {model!r} missing."),
                        "latency_ms": latency_ms,
                    }
            else:
                latency_ms = int((time.monotonic() - started) * 1000)
                return {"ok": True, "detail": f"Provider {provider!r} not validated yet.", "latency_ms": latency_ms}
        except Exception as exc:
            latency_ms = int((time.monotonic() - started) * 1000)
            return {"ok": False, "detail": str(exc), "latency_ms": latency_ms}


LLM_PROVIDER_SERVICE = LLMProviderService()
