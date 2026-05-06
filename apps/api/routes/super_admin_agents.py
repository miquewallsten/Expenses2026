# apps/api/routes/super_admin_agents.py
"""Super Admin routes for agent lifecycle management.

All endpoints require is_super_admin=True.
"""
from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.auth import require_super_admin
from apps.api.deps import get_db
from packages.modules.agent.core.agent_definition_service import AGENT_DEF_SERVICE
from packages.modules.agent.core.llm_provider_service import LLM_PROVIDER_SERVICE
from packages.modules.agent.models_definitions import (
    AgentDefinition, ChannelAgentConfig, LLMProviderConfig,
)

router = APIRouter(prefix="/super-admin", tags=["super-admin-agents"])


# ── Schemas ────────────────────────────────────────────────────────────────

class AgentDefinitionOut(BaseModel):
    id: int
    key: str
    name: str
    description: Optional[str]
    system_prompt: str
    allowed_tools: List[str]
    persona: str
    is_system: bool
    is_active: bool

    class Config:
        from_attributes = True


class AgentDefinitionIn(BaseModel):
    key: str
    name: str
    description: Optional[str] = None
    system_prompt: str
    allowed_tools: List[str] = []
    persona: str = "admin"
    is_active: bool = True


class ChannelConfigOut(BaseModel):
    id: int
    agent_id: int
    channel_type: str
    autonomous_threshold: float
    high_stakes_rules: List[dict]
    test_mode: bool


class ChannelConfigIn(BaseModel):
    autonomous_threshold: float = 0.80
    high_stakes_rules: List[dict] = []
    test_mode: bool = False


class LLMConfigOut(BaseModel):
    id: int
    company_id: Optional[int]
    provider: str
    base_url: Optional[str]
    api_key_env_ref: Optional[str]
    model_name: str
    is_active: bool


class LLMConfigIn(BaseModel):
    company_id: Optional[int] = None
    provider: str = "ollama"
    base_url: Optional[str] = None
    api_key_env_ref: Optional[str] = None
    model_name: str = "llama3.2"
    is_active: bool = True


class ChatTestRequest(BaseModel):
    prompt: str
    provider: str = "openai"
    model_name: str = "glm-5:cloud"
    base_url: Optional[str] = None
    api_key_env_ref: Optional[str] = None


class ChatTestResponse(BaseModel):
    ok: bool
    model: Optional[str] = None
    content: Optional[str] = None
    latency_ms: int
    error: Optional[str] = None


# ── Agent Definitions ──────────────────────────────────────────────────────

def _serialize_agent(a: AgentDefinition) -> dict:
    import json
    tools = a.allowed_tools
    if isinstance(tools, str):
        try:
            tools = json.loads(tools)
        except Exception:
            tools = []
    return {
        "id": a.id, "key": a.key, "name": a.name, "description": a.description,
        "system_prompt": a.system_prompt, "allowed_tools": tools,
        "persona": a.persona, "is_system": a.is_system, "is_active": a.is_active,
    }


@router.get("/agent-definitions")
def list_agent_definitions(db: Session = Depends(get_db), _=Depends(require_super_admin)):
    return [_serialize_agent(a) for a in AGENT_DEF_SERVICE.get_all(db)]


@router.post("/agent-definitions", status_code=201)
def create_agent_definition(body: AgentDefinitionIn, db: Session = Depends(get_db),
                             _=Depends(require_super_admin)):
    try:
        agent = AGENT_DEF_SERVICE.upsert(db, body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize_agent(agent)


@router.get("/agent-definitions/{key}")
def get_agent_definition(key: str, db: Session = Depends(get_db), _=Depends(require_super_admin)):
    agent = AGENT_DEF_SERVICE.get_by_key(db, key)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _serialize_agent(agent)


@router.put("/agent-definitions/{key}")
def update_agent_definition(key: str, body: AgentDefinitionIn, db: Session = Depends(get_db),
                             _=Depends(require_super_admin)):
    data = body.model_dump()
    data["key"] = key
    try:
        agent = AGENT_DEF_SERVICE.upsert(db, data)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize_agent(agent)


@router.delete("/agent-definitions/{key}", status_code=204)
def delete_agent_definition(key: str, db: Session = Depends(get_db), _=Depends(require_super_admin)):
    try:
        AGENT_DEF_SERVICE.delete(db, key)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.patch("/agent-definitions/{key}/toggle")
def toggle_agent(key: str, is_active: bool, db: Session = Depends(get_db),
                 _=Depends(require_super_admin)):
    try:
        agent = AGENT_DEF_SERVICE.toggle_active(db, key, is_active)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _serialize_agent(agent)


# ── Channel Agent Configs ──────────────────────────────────────────────────

def _serialize_channel_cfg(c: ChannelAgentConfig) -> dict:
    import json
    rules = c.high_stakes_rules
    if isinstance(rules, str):
        try:
            rules = json.loads(rules)
        except Exception:
            rules = []
    return {
        "id": c.id, "agent_id": c.agent_id, "channel_type": c.channel_type,
        "autonomous_threshold": c.autonomous_threshold,
        "high_stakes_rules": rules, "test_mode": c.test_mode,
    }


@router.get("/channel-agent-configs")
def list_channel_configs(db: Session = Depends(get_db), _=Depends(require_super_admin)):
    cfgs = db.query(ChannelAgentConfig).all()
    return [_serialize_channel_cfg(c) for c in cfgs]


@router.put("/channel-agent-configs/{agent_key}")
def update_channel_config(agent_key: str, body: ChannelConfigIn,
                           db: Session = Depends(get_db), _=Depends(require_super_admin)):
    import json
    agent = AGENT_DEF_SERVICE.get_by_key(db, agent_key)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    cfg = db.query(ChannelAgentConfig).filter_by(agent_id=agent.id).one_or_none()
    if cfg is None:
        cfg = ChannelAgentConfig(agent_id=agent.id, channel_type=agent_key)
        db.add(cfg)
    cfg.autonomous_threshold = body.autonomous_threshold
    cfg.high_stakes_rules = json.dumps(body.high_stakes_rules)
    cfg.test_mode = body.test_mode
    db.commit()
    db.refresh(cfg)
    return _serialize_channel_cfg(cfg)


# ── LLM Provider Configs ────────────────────────────────────────────────────

def _serialize_llm(c: LLMProviderConfig) -> dict:
    return {
        "id": c.id, "company_id": c.company_id, "provider": c.provider,
        "base_url": c.base_url, "api_key_env_ref": c.api_key_env_ref,
        "model_name": c.model_name, "is_active": c.is_active,
    }


def _validate_api_key_env_ref(value: str | None) -> str:
    """Validate that api_key_env_ref is an env var name, not an actual API key."""
    if not value:
        return value
    # Env var names are typically short and uppercase with underscores
    # API keys are long alphanumeric strings (often 30+ chars)
    # Valid env var names: LLM_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY
    # Invalid (actual keys): 87e154dc2299465fbc89589c1f5043f1..., sk-abc123...
    value_stripped = value.strip()
    if len(value_stripped) > 25:
        # Check if it looks like an env var name (all caps with underscores)
        if not (value_stripped.isupper() or value_stripped.upper() == value_stripped):
            raise HTTPException(
                status_code=400,
                detail="api_key_env_ref must be the NAME of the environment variable (e.g., LLM_API_KEY), not the actual API key value."
            )
    return value


@router.get("/llm-configs")
def list_llm_configs(db: Session = Depends(get_db), _=Depends(require_super_admin)):
    return [_serialize_llm(c) for c in db.query(LLMProviderConfig).all()]


@router.post("/llm-configs", status_code=201)
def create_llm_config(body: LLMConfigIn, db: Session = Depends(get_db),
                      _=Depends(require_super_admin)):
    # Validate api_key_env_ref
    _validate_api_key_env_ref(body.api_key_env_ref)

    existing = (
        db.query(LLMProviderConfig)
        .filter(LLMProviderConfig.company_id == body.company_id)
        .one_or_none()
    )
    if existing:
        existing.provider = body.provider
        existing.base_url = body.base_url
        existing.api_key_env_ref = body.api_key_env_ref
        existing.model_name = body.model_name
        existing.is_active = body.is_active
        db.commit()
        db.refresh(existing)
        return _serialize_llm(existing)
    cfg = LLMProviderConfig(**body.model_dump())
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return _serialize_llm(cfg)


@router.put("/llm-configs/{cfg_id}")
def update_llm_config(cfg_id: int, body: LLMConfigIn, db: Session = Depends(get_db),
                      _=Depends(require_super_admin)):
    # Validate api_key_env_ref
    _validate_api_key_env_ref(body.api_key_env_ref)

    cfg = db.query(LLMProviderConfig).filter_by(id=cfg_id).one_or_none()
    if not cfg:
        raise HTTPException(status_code=404, detail="Config not found")
    for k, v in body.model_dump().items():
        setattr(cfg, k, v)
    db.commit()
    db.refresh(cfg)
    return _serialize_llm(cfg)


@router.delete("/llm-configs/{cfg_id}", status_code=204)
def delete_llm_config(cfg_id: int, db: Session = Depends(get_db), _=Depends(require_super_admin)):
    cfg = db.query(LLMProviderConfig).filter_by(id=cfg_id).one_or_none()
    if cfg:
        db.delete(cfg)
        db.commit()


@router.post("/llm-configs/test")
def test_llm_connection(body: LLMConfigIn, _=Depends(require_super_admin)):
    result = LLM_PROVIDER_SERVICE.test_connection(body.model_dump())
    return result


@router.post("/llm-configs/chat-test", response_model=ChatTestResponse)
def test_llm_chat(body: ChatTestRequest, _=Depends(require_super_admin)):
    """Test an actual chat completion with a specific model configuration."""
    import os
    import time
    from apps.api.ai.ollama_client import chat_with_messages_dynamic, Provider

    # Map ollama-cloud to ollama (same API, different base URL)
    provider_kind = "ollama" if body.provider in ("ollama", "ollama-cloud") else body.provider

    # Resolve API key
    api_key = ""
    if body.api_key_env_ref:
        api_key = os.getenv(body.api_key_env_ref, "")
    elif body.provider == "ollama-cloud":
        api_key = os.getenv("LLM_API_KEY", "") or os.getenv("OLLAMA_API_KEY", "")
    elif body.provider == "anthropic":
        api_key = os.getenv("ANTHROPIC_API_KEY", "")

    # Build provider config from request
    provider = Provider(
        kind=provider_kind,
        base_url=(body.base_url or "").rstrip("/"),
        model=body.model_name,
        api_key=api_key,
    )

    started = time.monotonic()
    try:
        result = chat_with_messages_dynamic(
            messages=[{"role": "user", "content": body.prompt}],
            provider=provider,
            temperature=0.7,
        )
        latency_ms = int((time.monotonic() - started) * 1000)
        return ChatTestResponse(
            ok=result.get("ok", False),
            model=result.get("model"),
            content=result.get("content"),
            latency_ms=latency_ms,
            error=result.get("error"),
        )
    except Exception as e:
        latency_ms = int((time.monotonic() - started) * 1000)
        return ChatTestResponse(
            ok=False,
            model=body.model_name,
            latency_ms=latency_ms,
            error=str(e),
        )


# ── Tool Registry (read-only) ───────────────────────────────────────────────

@router.get("/tool-registry")
def get_tool_registry(_=Depends(require_super_admin)):
    return AGENT_DEF_SERVICE.get_tool_list()
