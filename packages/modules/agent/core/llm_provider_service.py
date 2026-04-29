from __future__ import annotations

import json
import os
import time
import urllib.request
from typing import Any

from packages.modules.agent.models_definitions import LLMProviderConfig


class LLMProviderService:
    """
    Resolves which LLM provider and model to use for a given request.
    Supports a global default with per-company overrides.
    """

    def resolve_provider(self, db, company_id: int | None = None) -> LLMProviderConfig:
        """
        Resolution chain:
        1. Active company-specific config.
        2. Active global config (company_id is None).
        3. Hardcoded system default (Ollama/llama3.2).
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

        # 3. Hardcoded system default
        return LLMProviderConfig(
            provider="ollama",
            model_name="llama3.2",
            is_active=True
        )

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
            if provider == "ollama":
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
