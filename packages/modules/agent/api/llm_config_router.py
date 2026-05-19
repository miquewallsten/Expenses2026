"""Super Admin LLM Provider Configuration API.

The Super Admin sets the global LLM provider (company_id=None), which all
companies inherit unless they have their own override. This ensures the
platform's AI is centrally controlled while allowing per-tenant overrides.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from apps.api.auth import require_super_admin
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.agent.models_definitions import LLMProviderConfig
from packages.modules.agent.core.llm_provider_service import LLM_PROVIDER_SERVICE

router = APIRouter(prefix="/agent/llm", tags=["agent-llm-config"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class LLMConfigRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_id: int | None
    provider: str
    base_url: str | None
    model_name: str
    api_key_env_ref: str | None
    api_key_set: bool
    is_active: bool


class LLMConfigUpsert(BaseModel):
    model_config = ConfigDict(extra="forbid")
    company_id: int | None = Field(default=None, description="None = global config")
    provider: str = Field(default="ollama", description="ollama | openai | anthropic | ollama-cloud")
    base_url: str | None = None
    model_name: str = Field(default="llama3.2")
    api_key: str | None = None
    api_key_env_ref: str | None = None
    is_active: bool = True


class LLMConfigTest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: str = "ollama"
    base_url: str | None = None
    model_name: str = "llama3.2"
    api_key: str | None = None
    api_key_env_ref: str | None = None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _to_read(config: LLMProviderConfig) -> LLMConfigRead:
    return LLMConfigRead(
        id=config.id,
        company_id=config.company_id,
        provider=config.provider,
        base_url=config.base_url,
        model_name=config.model_name,
        api_key_env_ref=config.api_key_env_ref,
        api_key_set=bool(config.api_key),
        is_active=config.is_active,
    )


# ── Global Config (Super Admin) ──────────────────────────────────────────────

@router.get("/global-config", response_model=LLMConfigRead)
def get_global_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> LLMConfigRead:
    """Get the platform-wide LLM provider configuration (Super Admin only)."""
    config = (
        db.query(LLMProviderConfig)
        .filter(LLMProviderConfig.company_id == None, LLMProviderConfig.is_active == True)
        .first()
    )
    if config is None:
        raise HTTPException(status_code=404, detail="No global LLM config found. Create one with PUT.")
    return _to_read(config)


@router.put("/global-config", response_model=LLMConfigRead)
def upsert_global_config(
    body: LLMConfigUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> LLMConfigRead:
    """Set the platform-wide LLM provider. All companies inherit this unless overridden."""
    body.company_id = None  # Force global
    config = LLM_PROVIDER_SERVICE.upsert(db, body.model_dump())
    return _to_read(config)


# ── Company Override Config ──────────────────────────────────────────────────

@router.get("/company-config/{company_id}", response_model=LLMConfigRead | None)
def get_company_config(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> LLMConfigRead | None:
    """Get a company-specific LLM override config (Super Admin only)."""
    config = (
        db.query(LLMProviderConfig)
        .filter(LLMProviderConfig.company_id == company_id)
        .first()
    )
    if config is None:
        return None
    return _to_read(config)


@router.put("/company-config/{company_id}", response_model=LLMConfigRead)
def upsert_company_config(
    company_id: int,
    body: LLMConfigUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> LLMConfigRead:
    """Set a company-specific LLM override (Super Admin only)."""
    body.company_id = company_id
    config = LLM_PROVIDER_SERVICE.upsert(db, body.model_dump())
    return _to_read(config)


@router.delete("/company-config/{company_id}")
def delete_company_config(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> dict:
    """Remove a company's LLM override, reverting to the global config."""
    config = (
        db.query(LLMProviderConfig)
        .filter(LLMProviderConfig.company_id == company_id)
        .first()
    )
    if config is None:
        raise HTTPException(status_code=404, detail="No company override found.")
    db.delete(config)
    db.commit()
    return {"ok": True, "detail": f"Company {company_id} LLM override removed. Will use global config."}


# ── Connection Test ──────────────────────────────────────────────────────────

@router.post("/test-connection")
def test_llm_connection(
    body: LLMConfigTest,
    current_user: User = Depends(require_super_admin),
) -> dict:
    """Test an LLM provider configuration without saving it."""
    return LLM_PROVIDER_SERVICE.test_connection(body.model_dump())


# ── List All Configs ──────────────────────────────────────────────────────────

@router.get("/configs", response_model=list[LLMConfigRead])
def list_all_configs(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> list[LLMConfigRead]:
    """List all LLM provider configs (global + company overrides)."""
    configs = db.query(LLMProviderConfig).order_by(LLMProviderConfig.company_id.asc(nulls_first=True)).all()
    return [_to_read(c) for c in configs]
