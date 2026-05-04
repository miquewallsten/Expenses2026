"""Onboarding completion endpoint.

Saves learned preferences to agent memory and marks onboarding complete.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from apps.api.auth import require_admin
from apps.api.deps import get_db
from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.agent.core.memory import TenantMemoryService
from packages.modules.agent.core.workflow import WORKFLOW_SERVICE

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


class OnboardingProgressRequest(BaseModel):
    """Progress save request - partial state."""
    current_step: str = Field(..., description="Current step identifier")
    company_type: str | None = Field(None, description="Selected company type")
    company_profile: dict[str, Any] | None = Field(None, description="Company profile data")
    selected_modules: list[str] | None = Field(None, description="Selected module keys")
    module_configs: dict[str, Any] | None = Field(None, description="Module configurations")


class OnboardingCompleteRequest(BaseModel):
    """Final completion request."""
    company_type: str = Field(..., description="Selected company type")
    company_profile: dict[str, Any] = Field(..., description="Company profile data")
    selected_modules: list[str] = Field(..., description="Selected module keys")
    module_configs: dict[str, Any] = Field(..., description="Module configurations")


class OnboardingProgressResponse(BaseModel):
    """Progress save response."""
    ok: bool
    current_step: str
    message: str = "Progress saved"


class OnboardingCompleteResponse(BaseModel):
    """Completion response."""
    ok: bool
    message: str = "Onboarding complete"
    saved_memories: list[str]


@router.post("/{company_id}/progress", response_model=OnboardingProgressResponse)
def save_progress(
    company_id: int,
    body: OnboardingProgressRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
) -> OnboardingProgressResponse:
    """Save onboarding progress (partial state).

    This is called after each step to allow resuming if the user leaves.
    """
    # Verify company access
    if user.company_id != company_id:
        raise HTTPException(403, "Access denied")

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")

    # Update company onboarding state
    if not hasattr(company, 'onboarding_data'):
        company.onboarding_data = {}

    company.onboarding_step = body.current_step
    company.onboarding_data = {
        "company_type": body.company_type,
        "company_profile": body.company_profile,
        "selected_modules": body.selected_modules,
        "module_configs": body.module_configs,
    }

    if not company.onboarding_started_at:
        company.onboarding_started_at = datetime.now(UTC)

    db.commit()

    return OnboardingProgressResponse(
        ok=True,
        current_step=body.current_step,
    )


@router.post("/{company_id}/complete", response_model=OnboardingCompleteResponse)
def complete_onboarding(
    company_id: int,
    body: OnboardingCompleteRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
) -> OnboardingCompleteResponse:
    """Complete onboarding and save learned preferences to agent memory.

    This is called when the user finishes the onboarding wizard.
    All preferences are stored in tenant memory for future agent context.
    """
    # Verify company access
    if user.company_id != company_id:
        raise HTTPException(403, "Access denied")

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")

    memory = TenantMemoryService(db)
    saved_memories: list[str] = []

    # Save company type
    memory.save(
        company_id=company_id,
        agent_key="admin",
        key="company_type",
        value=body.company_type,
        confidence=1.0,
    )
    saved_memories.append("company_type")

    # Save selected modules
    memory.save(
        company_id=company_id,
        agent_key="admin",
        key="enabled_modules",
        value=",".join(body.selected_modules),
        confidence=1.0,
    )
    saved_memories.append("enabled_modules")

    # Save company profile preferences
    if body.company_profile:
        memory.save(
            company_id=company_id,
            agent_key="admin",
            key="company_profile",
            value=json.dumps(body.company_profile),
            confidence=1.0,
        )
        saved_memories.append("company_profile")

        # Save individual preferences for quick access
        for key, value in body.company_profile.items():
            if value and key in ("currency", "timezone", "country"):
                memory.save(
                    company_id=company_id,
                    agent_key="admin",
                    key=f"preference_{key}",
                    value=str(value),
                    confidence=1.0,
                )

    # Save module configurations
    for module, config in body.module_configs.items():
        memory.save(
            company_id=company_id,
            agent_key="admin",
            key=f"module_config_{module}",
            value=json.dumps(config),
            confidence=1.0,
        )
        saved_memories.append(f"module_config_{module}")

    # Mark workflow complete
    try:
        WORKFLOW_SERVICE.complete(db, company_id=company_id, workflow_key="onboarding")
    except ValueError:
        # Workflow doesn't exist, that's okay
        pass

    # Update company onboarding status
    company.onboarding_completed_at = datetime.now(UTC)
    company.onboarding_step = None
    company.onboarding_data = None  # Clear temp data

    db.commit()

    return OnboardingCompleteResponse(
        ok=True,
        saved_memories=saved_memories,
    )


@router.get("/{company_id}/status")
def get_onboarding_status(
    company_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
) -> dict[str, Any]:
    """Get onboarding status for a company.

    Returns whether onboarding is complete and any saved progress.
    """
    if user.company_id != company_id:
        raise HTTPException(403, "Access denied")

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "Company not found")

    return {
        "completed": bool(getattr(company, 'onboarding_completed_at', None)),
        "started_at": getattr(company, 'onboarding_started_at', None),
        "completed_at": getattr(company, 'onboarding_completed_at', None),
        "current_step": getattr(company, 'onboarding_step', None),
        "saved_state": getattr(company, 'onboarding_data', None),
    }