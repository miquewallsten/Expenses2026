"""
Super Admin Router - Platform-wide management across ALL tenants
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from apps.api.deps import get_db
from apps.api.auth import require_super_admin
from packages.core.platform.models import Company
from packages.core.platform.models_user import User, MagicLinkToken
from packages.modules.agent.core.orchestrator import ORCHESTRATOR

router = APIRouter(prefix="/super-admin", tags=["super-admin"])

# ── Models ──────────────────────────────────────────────────────────────────

class TenantSummary(BaseModel):
    id: int
    name: str
    slug: str
    user_count: int
    is_active: bool
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

# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/tenants", response_model=List[TenantSummary], dependencies=[Depends(require_super_admin)])
async def list_all_tenants(db: Session = Depends(get_db)):
    """List all companies/tenants in the platform"""
    companies = db.query(Company).all()
    
    result = []
    for company in companies:
        user_count = db.query(User).filter_by(company_id=company.id, is_active=True).count()
        result.append({
            "id": company.id,
            "name": company.name,
            "slug": company.slug,
            "user_count": user_count,
            "is_active": True,  # All companies are active by default
            "created_at": company.created_at.isoformat() if company.created_at else None
        })
    
    return result

@router.post("/tenants", response_model=TenantSummary, dependencies=[Depends(require_super_admin)])
async def create_tenant(payload: TenantCreate, db: Session = Depends(get_db)):
    """Create a new tenant and its initial admin user"""
    # 1. Create Company
    company = Company(name=payload.name, slug=payload.slug)
    db.add(company)
    db.commit()
    db.refresh(company)
    
    # 2. Create Admin User for that company
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
    
    return {
        "id": company.id,
        "name": company.name,
        "slug": company.slug,
        "user_count": 1,
        "is_active": True,
        "created_at": company.created_at.isoformat() if company.created_at else None
    }

@router.put("/tenants/{tenant_id}", response_model=TenantSummary, dependencies=[Depends(require_super_admin)])
async def update_tenant(tenant_id: int, payload: TenantUpdate, db: Session = Depends(get_db)):
    """Update tenant settings or status"""
    company = db.query(Company).filter(Company.id == tenant_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    if payload.name: company.name = payload.name
    if payload.is_active is not None: company.is_active = payload.is_active
    
    db.commit()
    db.refresh(company)
    
    user_count = db.query(User).filter_by(company_id=company.id, is_active=True).count()
    return {
        "id": company.id,
        "name": company.name,
        "slug": company.slug,
        "user_count": user_count,
        "is_active": company.is_active,
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
            "last_login": user.last_login_at.isoformat() if user.last_login_at else ""
        })
    
    return result

@router.get("/stats")
async def get_platform_stats(db: Session = Depends(get_db)):
    """Get platform-wide statistics"""
    total_companies = db.query(Company).count()
    total_users = db.query(User).count()
    active_users = db.query(User).filter_by(is_active=True).count()
    
    return {
        "total_companies": total_companies,
        "total_users": total_users,
        "active_users": active_users,
        "inactive_users": total_users - active_users
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