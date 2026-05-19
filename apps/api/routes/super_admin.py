"""
Super Admin Router - Platform-wide management across ALL tenants
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel

from apps.api.deps import get_db
from apps.api.auth import require_super_admin
from packages.core.platform.models import Company
from packages.core.platform.models_user import User, MagicLinkToken
from packages.modules.agent.core.orchestrator import ORCHESTRATOR
from packages.modules.agent.core.engine import run_turn

from packages.core.platform.models_company_setup import CompanySetup

import secrets
from datetime import datetime, timedelta, timezone
from apps.api.config import settings

from packages.core.platform.models_channels import CompanyChannelConfig
from packages.core.platform.models_auth_settings import CompanyAuthSettings

# For email integration
from packages.modules.channels.service.notifier import NotifyRequest, Recipient, recipients_from_users, send, RenderedMessage
from packages.core.platform.models_ai_governance import CompanyAiGovernancePolicy

router = APIRouter(prefix="/super-admin", tags=["super-admin"])

# ── Models ──────────────────────────────────────────────────────────────────

class TenantSummary(BaseModel):
    id: int
    name: str
    slug: str
    user_count: int
    is_active: bool
    dev_login_enabled: bool = False
    created_at: str

class AgentTeamStatus(BaseModel):
    team: str
    status: str
    requests: int
    success_rate: float
    company_id: int
    company_name: str

class SystemHealth(BaseModel):
    database: bool
    redis: bool
    ollama: bool
    storage: bool
    uptime: str
    memory_usage: float
    cpu_usage: float

class GlobalUser(BaseModel):
    id: int
    email: str
    full_name: str
    company_id: int
    company_name: str
    role: str
    is_active: bool
    last_login: str | None = None

class TenantCreate(BaseModel):
    name: str
    slug: str
    admin_email: str

class TenantUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    dev_login_enabled: Optional[bool] = None

class PlatformSettingsUpdate(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_name: Optional[str] = None
    smtp_from_email: Optional[str] = None
    imap_host: Optional[str] = None
    imap_port: Optional[int] = None
    imap_user: Optional[str] = None
    imap_password: Optional[str] = None
    imap_enabled: Optional[bool] = None
    whatsapp_business_id: Optional[str] = None
    whatsapp_phone_number_id: Optional[str] = None
    whatsapp_access_token: Optional[str] = None
    whatsapp_webhook_verify_token: Optional[str] = None
    whatsapp_webhook_secret: Optional[str] = None
    whatsapp_enabled: Optional[bool] = None
    whatsapp_default_language: Optional[str] = None
    whatsapp_instructions: Optional[str] = None

class AgentChatRequest(BaseModel):
    message: str
    persona: str = "admin"
    session_id: Optional[str] = None

# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/platform-settings", dependencies=[Depends(require_super_admin)])
async def get_platform_settings(db: Session = Depends(get_db)):
    from packages.core.platform.models_platform_settings import PlatformSettings
    settings = db.query(PlatformSettings).first()
    if not settings:
        # Create default
        settings = PlatformSettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings

@router.patch("/platform-settings", dependencies=[Depends(require_super_admin)])
async def update_platform_settings(payload: PlatformSettingsUpdate, db: Session = Depends(get_db)):
    from packages.core.platform.models_platform_settings import PlatformSettings
    settings = db.query(PlatformSettings).first()
    if not settings:
        settings = PlatformSettings()
        db.add(settings)
    
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(settings, k, v)
    
    db.commit()
    db.refresh(settings)
    return settings

@router.post("/platform-settings/test-connection", dependencies=[Depends(require_super_admin)])
async def test_platform_mailbox_connection(payload: Dict[str, Any]):
    """Test SMTP or IMAP connection with provided credentials"""
    from packages.core.platform.service.mail_tester import test_smtp_connection, test_imap_connection
    
    test_type = payload.get("type", "smtp") # smtp or imap
    config = payload.get("config", {})
    
    if test_type == "smtp":
        return await test_smtp_connection(config)
    elif test_type == "imap":
        return await test_imap_connection(config)
    else:
        raise HTTPException(status_code=400, detail="Invalid test type")

@router.get("/tenants", response_model=List[TenantSummary], dependencies=[Depends(require_super_admin)])
async def list_all_tenants(db: Session = Depends(get_db)):
    """List all companies/tenants in the platform"""
    companies = db.query(Company).all()
    
    result = []
    for company in companies:
        user_count = db.query(User).filter_by(company_id=company.id, is_active=True).count()
        setup = db.query(CompanySetup).filter_by(company_id=company.id).first()
        result.append({
            "id": company.id,
            "name": company.name,
            "slug": company.slug,
            "user_count": user_count,
            "is_active": True,  # All companies are active by default
            "dev_login_enabled": setup.dev_login_enabled if setup else False,
            "created_at": company.created_at.isoformat() if company.created_at else None
        })
    
    return result

@router.post("/tenants", response_model=TenantSummary, dependencies=[Depends(require_super_admin)])
async def create_tenant(payload: TenantCreate, db: Session = Depends(get_db)):
    """Create a new tenant and its initial admin user"""
    # 1. Create Company
    company = Company(name=payload.name, slug=payload.slug)
    db.add(company)
    db.flush()
    
    # 2. Create CompanySetup and required settings
    setup = CompanySetup(company_id=company.id, dev_login_enabled=False)
    db.add(setup)
    db.add(CompanyChannelConfig(company_id=company.id))
    db.add(CompanyAuthSettings(company_id=company.id))
    
    # 3. Create Admin User for that company
    user = User(
        company_id=company.id,
        email=payload.admin_email,
        full_name=f"Admin of {payload.name}",
        role="admin",
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # 4. Generate first Magic Link for the Admin
    raw_token = secrets.token_urlsafe(48)
    link_token = MagicLinkToken(
        user_id=user.id,
        token=raw_token,
        expires_at=datetime.now(tz=timezone.utc) + timedelta(hours=24), # Give them 24h
    )
    db.add(link_token)
    db.commit()
    
    # 5. Send Invite Email via Platform SMTP
    link = f"http://localhost:3001/auth/verify?token={raw_token}"
    
    notify_req = NotifyRequest(
        company_id=0, # Platform-level event
        event_type="tenant_onboarding",
        recipients=[Recipient(email=user.email, name=user.full_name)],
        message=RenderedMessage(
            subject=f"Welcome to XpenseFlow: {company.name}",
            text=f"Your tenant '{company.name}' has been created. Click here to begin onboarding: {link}",
            html=f"""
            <div style="font-family: sans-serif; padding: 20px;">
                <h2>Welcome to XpenseFlow</h2>
                <p>Your tenant <strong>{company.name}</strong> is ready for initialization.</p>
                <div style="margin: 30px 0;">
                    <a href="{link}" style="background: #e11d48; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                        Initialize Corporate Cockpit
                    </a>
                </div>
                <p style="font-size: 12px; color: #666;">This link expires in 24 hours.</p>
            </div>
            """
        )
    )
    send(db, notify_req)
    
    return {
        "id": company.id,
        "name": company.name,
        "slug": company.slug,
        "user_count": 1,
        "is_active": True,
        "dev_login_enabled": False,
        "created_at": company.created_at.isoformat() if company.created_at else None,
        "invite_link": link # Return for manual copy if SMTP fails
    }

@router.put("/tenants/{tenant_id}", response_model=TenantSummary, dependencies=[Depends(require_super_admin)])
async def update_tenant(tenant_id: int, payload: TenantUpdate, db: Session = Depends(get_db)):
    """Update tenant settings or status"""
    company = db.query(Company).filter(Company.id == tenant_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    if payload.name: company.name = payload.name
    if payload.is_active is not None: company.is_active = payload.is_active
    
    if payload.dev_login_enabled is not None:
        setup = db.query(CompanySetup).filter_by(company_id=tenant_id).first()
        if not setup:
            setup = CompanySetup(company_id=tenant_id)
            db.add(setup)
        setup.dev_login_enabled = payload.dev_login_enabled
    
    db.commit()
    db.refresh(company)
    
    user_count = db.query(User).filter_by(company_id=company.id, is_active=True).count()
    setup = db.query(CompanySetup).filter_by(company_id=company.id).first()
    return {
        "id": company.id,
        "name": company.name,
        "slug": company.slug,
        "user_count": user_count,
        "is_active": company.is_active,
        "dev_login_enabled": setup.dev_login_enabled if setup else False,
        "created_at": company.created_at.isoformat() if company.created_at else None
    }

@router.delete("/tenants/{tenant_id}", dependencies=[Depends(require_super_admin)])
async def delete_tenant(tenant_id: int, db: Session = Depends(get_db)):
    """Hard delete a tenant and all associated data (Cascading)"""
    company = db.query(Company).filter(Company.id == tenant_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    db.delete(company)
    db.commit()
    return {"detail": "Tenant deleted successfully"}

@router.get("/tenants/{tenant_id}", dependencies=[Depends(require_super_admin)])
async def get_tenant_details(tenant_id: int, db: Session = Depends(get_db)):
    """Get full details of a specific company/tenant"""
    company = db.query(Company).filter(Company.id == tenant_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Tenant not found")
        
    setup = db.query(CompanySetup).filter_by(company_id=tenant_id).first()
    channels = db.query(CompanyChannelConfig).filter_by(company_id=tenant_id).first()
    
    return {
        "company": company,
        "setup": setup,
        "channels": channels
    }

@router.get("/tenants/{tenant_id}/users", dependencies=[Depends(require_super_admin)])
async def get_tenant_users(tenant_id: int, db: Session = Depends(get_db)):
    """Get list of users for a specific tenant"""
    users = db.query(User).filter(User.company_id == tenant_id).all()
    return users

@router.get("/agents/status", response_model=List[AgentTeamStatus], dependencies=[Depends(require_super_admin)])
async def get_global_agent_status():
    """Get status of ALL agent teams across ALL companies"""
    status = ORCHESTRATOR.get_team_status()
    
    result = []
    for team_name, team_status in status.items():
        result.append({
            "team": team_name,
            "status": "active" if team_status["active"] else "idle",
            "requests": team_status["request_count"],
            "success_rate": team_status["success_rate"],
            "company_id": 0,  # Global status
            "company_name": "Platform Global"
        })
    
    return result

@router.get("/agents/metrics", dependencies=[Depends(require_super_admin)])
async def get_global_agent_metrics():
    """Get real-time performance metrics for the entire agent fleet"""
    return ORCHESTRATOR.get_real_time_metrics()

@router.put("/agents/teams/{team_id}", dependencies=[Depends(require_super_admin)])
async def update_agent_team(team_id: str, config: Dict[str, Any]):
    """Update a global agent team's configuration"""
    if ORCHESTRATOR.update_team_config(team_id, config):
        return {"detail": f"Team {team_id} updated successfully"}
    raise HTTPException(status_code=404, detail="Agent team not found")

@router.post("/agents/teams", dependencies=[Depends(require_super_admin)])
async def create_agent_team(payload: Dict[str, Any]):
    """Provision a new specialized agent team globally"""
    team_id = ORCHESTRATOR.add_new_team(
        name=payload.get("name", "New Team"),
        description=payload.get("description", ""),
        personas=payload.get("personas", ["admin"]),
        capabilities=payload.get("capabilities", [])
    )
    return {"team_id": team_id, "detail": "New agent team provisioned"}

@router.get("/system-health", response_model=SystemHealth, dependencies=[Depends(require_super_admin)])
async def get_system_health():
    """Get platform-wide system health"""
    # Placeholder - would integrate with actual system monitoring
    return {
        "database": True,
        "redis": True, 
        "ollama": True,
        "storage": True,
        "uptime": "24h",
        "memory_usage": 45.2,
        "cpu_usage": 12.8
    }

@router.get("/users", response_model=List[GlobalUser])
async def list_all_users(db: Session = Depends(get_db)):
    """List ALL users across ALL companies"""
    from sqlalchemy.orm import aliased
    
    # Use aliased to avoid circular imports
    CompanyAlias = aliased(Company)
    users = db.query(User, CompanyAlias).join(CompanyAlias, User.company_id == CompanyAlias.id).all()
    
    result = []
    for user, company in users:
        result.append({
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "company_id": user.company_id,
            "company_name": company.name if company else "Unknown",
            "role": user.role,
            "is_active": user.is_active,
            "last_login": user.last_login_at.isoformat() if user.last_login_at else None
        })
    
    return result

@router.patch("/users/{user_id}", dependencies=[Depends(require_super_admin)])
async def update_global_user(user_id: int, payload: Dict[str, Any], db: Session = Depends(get_db)):
    """Update any user globally (is_active, role, etc)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    for k, v in payload.items():
        if hasattr(user, k):
            setattr(user, k, v)
    
    db.commit()
    db.refresh(user)
    return {"status": "updated"}

@router.post("/users/{user_id}/resend-invite", dependencies=[Depends(require_super_admin)])
async def resend_user_invite(user_id: int, db: Session = Depends(get_db)):
    """Generate and return a fresh magic link for any user"""
    import secrets
    from datetime import datetime, timedelta, timezone
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Invalidate old tokens
    db.query(MagicLinkToken).filter(MagicLinkToken.user_id == user.id).delete()
    
    raw_token = secrets.token_urlsafe(48)
    token = MagicLinkToken(
        user_id=user.id,
        token=raw_token,
        expires_at=datetime.now(tz=timezone.utc) + timedelta(hours=24)
    )
    db.add(token)
    db.commit()
    
    # 3. Send Email
    link = f"http://localhost:3001/auth/verify?token={raw_token}"
    
    notify_req = NotifyRequest(
        company_id=0,
        event_type="invite_retry",
        recipients=[Recipient(email=user.email, name=user.full_name)],
        message=RenderedMessage(
            subject="Action Required: Access your XpenseFlow Portal",
            text=f"Greetings. Please use this link to access your dashboard: {link}",
            html=f"""
            <div style="font-family: sans-serif; padding: 20px;">
                <p>Greetings,</p>
                <p>Please use the secure link below to access your XpenseFlow dashboard.</p>
                <div style="margin: 30px 0;">
                    <a href="{link}" style="background: #e11d48; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                        Enter Cockpit
                    </a>
                </div>
                <p style="font-size: 12px; color: #666;">This link expires in 24 hours.</p>
            </div>
            """
        )
    )
    send(db, notify_req)
    
    return {"status": "sent", "link": link}

@router.get("/stats", dependencies=[Depends(require_super_admin)])
async def get_platform_stats(db: Session = Depends(get_db)):
    """Get platform-wide statistics"""
    try:
        total_companies = db.query(Company).count()
        total_users = db.query(User).count()
        active_users = db.query(User).filter_by(is_active=True).count()
        
        return {
            "total_companies": total_companies,
            "total_users": total_users,
            "active_users": active_users,
            "inactive_users": total_users - active_users
        }
    except Exception as e:
        # Graceful fallback if stats query fails
        print(f"Stats Error: {e}")
        return {
            "total_companies": 0,
            "total_users": 0,
            "active_users": 0,
            "inactive_users": 0,
            "error": str(e)
        }

# ── Real-time Agent Monitoring ──────────────────────────────────────────────

class AgentMetricsResponse(BaseModel):
    total_requests: int
    successful_requests: int
    failed_requests: int
    success_rate: float
    active_requests: int
    uptime_seconds: float
    request_rate_per_minute: float

class ActiveRequest(BaseModel):
    team: str
    start_time: float
    status: str
    user_message: str
    duration: Optional[float] = None
    end_time: Optional[float] = None
    error: Optional[str] = None

class TeamPerformance(BaseModel):
    team: str
    total_requests: int
    successful_requests: int
    failed_requests: int
    success_rate: float
    avg_duration: float

@router.get("/agent-metrics", response_model=AgentMetricsResponse)
async def get_agent_metrics():
    """Get real-time agent performance metrics"""
    metrics = ORCHESTRATOR.get_real_time_metrics()
    return metrics

@router.get("/active-requests", response_model=List[ActiveRequest])
async def get_active_requests():
    """Get currently active agent requests"""
    active_requests = ORCHESTRATOR.active_requests.values()
    return list(active_requests)

@router.get("/request-history", response_model=List[Dict])
async def get_request_history(limit: int = 100):
    """Get recent request history"""
    return ORCHESTRATOR.get_request_history(limit)

@router.get("/team-performance", response_model=Dict[str, TeamPerformance])
async def get_team_performance():
    """Get detailed performance metrics by team"""
    return ORCHESTRATOR.get_team_performance()

# Add more super admin endpoints as needed
@router.post("/agent/chat", dependencies=[Depends(require_super_admin)])
async def super_admin_agent_chat(payload: AgentChatRequest, db: Session = Depends(get_db)):
    """Specialized chat for platform configurations (using super-admin credentials)"""
    # Use the first admin user found in the DB as context for the agent
    super_user = db.query(User).filter(User.role == "admin").first()
    
    return run_turn(
        db=db,
        user=super_user,
        company_id=0, # Platform scale
        persona=payload.persona,
        user_message=payload.message,
        session_id=payload.session_id
    )


# ── Platform-wide AI Policy ────────────────────────────────────────────────────

class PlatformAiPolicyPatch(BaseModel):
    ai_enabled: Optional[bool] = None
    allowed_models: Optional[str] = None
    pii_redaction_level: Optional[Literal["strict", "standard", "off"]] = None
    max_tokens_per_call: Optional[int] = None
    monthly_token_budget: Optional[int] = None
    notes: Optional[str] = None


@router.get("/ai-policy", dependencies=[Depends(require_super_admin)])
async def get_platform_ai_policy(db: Session = Depends(get_db)):
    """Get the platform-wide AI governance policy (company_id=NULL)."""
    row = (
        db.query(CompanyAiGovernancePolicy)
        .filter(CompanyAiGovernancePolicy.company_id == 1)
        .one_or_none()
    )
    if not row:
        row = CompanyAiGovernancePolicy(company_id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return {
        "id": row.id,
        "ai_enabled": row.ai_enabled,
        "allowed_models": row.allowed_models,
        "pii_redaction_level": row.pii_redaction_level,
        "max_tokens_per_call": row.max_tokens_per_call,
        "monthly_token_budget": row.monthly_token_budget,
        "notes": row.notes,
    }


@router.patch("/ai-policy", dependencies=[Depends(require_super_admin)])
async def patch_platform_ai_policy(
    body: PlatformAiPolicyPatch,
    db: Session = Depends(get_db),
):
    """Update the platform-wide AI governance policy (company_id=NULL)."""
    row = (
        db.query(CompanyAiGovernancePolicy)
        .filter(CompanyAiGovernancePolicy.company_id == 1)
        .one_or_none()
    )
    if not row:
        row = CompanyAiGovernancePolicy(company_id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        if v is not None:
            setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "ai_enabled": row.ai_enabled,
        "allowed_models": row.allowed_models,
        "pii_redaction_level": row.pii_redaction_level,
        "max_tokens_per_call": row.max_tokens_per_call,
        "monthly_token_budget": row.monthly_token_budget,
        "notes": row.notes,
    }
