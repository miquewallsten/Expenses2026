from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from apps.api.auth import get_current_user, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_channels import CompanyChannelConfig
from packages.core.platform.models_user import User
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/channels", tags=["Channels"])

class ChannelConfigUpdate(BaseModel):
    email_enabled: Optional[bool] = None
    email_provider: Optional[str] = None
    email_from_address: Optional[str] = None
    whatsapp_enabled: Optional[bool] = None
    whatsapp_provider: Optional[str] = None

@router.get("/{company_id}")
def get_channel_config(company_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not getattr(current_user, "is_super_admin", False):
        require_same_company(company_id, current_user)
    config = db.query(CompanyChannelConfig).filter(CompanyChannelConfig.company_id == company_id).first()
    if not config:
        # Return default empty config
        return {"company_id": company_id, "email_enabled": False, "whatsapp_enabled": False}
    return config

@router.patch("/{company_id}")
def update_channel_config(company_id: int, payload: ChannelConfigUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not getattr(current_user, "is_super_admin", False):
        require_same_company(company_id, current_user)
    config = db.query(CompanyChannelConfig).filter(CompanyChannelConfig.company_id == company_id).first()
    if not config:
        config = CompanyChannelConfig(company_id=company_id)
        db.add(config)
    
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(config, k, v)
    
    db.commit()
    db.refresh(config)
    return config
