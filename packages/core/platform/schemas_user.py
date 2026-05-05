from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

# Valid role values — extend as platform capabilities grow
USER_ROLES = ["employee", "manager", "accounting", "admin", "executive", "secretary"]


class UserCreate(BaseModel):
    company_id: int
    email: str
    full_name: str
    role: str = "employee"
    # Extended profile
    department: str | None = None
    job_title: str | None = None
    phone: str | None = None
    # Org assignment
    legal_entity_id: int | None = None
    delegates_for_user_id: int | None = None
    # Capability flags
    can_create_expenses: bool = True
    can_create_corporate_expenses: bool = False
    can_invoice_corporation: bool = False
    is_amex_reconciler: bool = False
    requires_time_tracking: bool = False
    has_executive_reporting: bool = False
    can_access_accounting: bool = False
    can_view_analytics: bool = False
    # If True the API will send an invite magic link to the new user
    send_invite: bool = False
    # Initial project assignments
    project_ids: list[int] = []


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    department: str | None = None
    job_title: str | None = None
    phone: str | None = None
    legal_entity_id: int | None = None
    delegates_for_user_id: int | None = None
    can_create_expenses: bool | None = None
    can_create_corporate_expenses: bool | None = None
    can_invoice_corporation: bool | None = None
    is_amex_reconciler: bool | None = None
    requires_time_tracking: bool | None = None
    has_executive_reporting: bool | None = None
    can_access_accounting: bool | None = None
    can_view_analytics: bool | None = None
    # Provide a full replacement list; omit to leave unchanged
    project_ids: list[int] | None = None


class UserRead(BaseModel):
    id: int
    company_id: int
    email: str
    full_name: str
    role: str
    is_active: bool = True
    department: str | None = None
    job_title: str | None = None
    phone: str | None = None
    legal_entity_id: int | None = None
    delegates_for_user_id: int | None = None
    # Populated by service — name of the boss (for secretaries)
    delegates_for_user_name: str | None = None
    can_create_expenses: bool = True
    can_create_corporate_expenses: bool = False
    can_invoice_corporation: bool = False
    is_amex_reconciler: bool = False
    requires_time_tracking: bool = False
    has_executive_reporting: bool = False
    can_access_accounting: bool = False
    can_view_analytics: bool = False
    invited_at: datetime | None = None
    last_login_at: datetime | None = None
    created_at: datetime
    # Populated by service — list of assigned project IDs
    project_ids: list[int] = []

    model_config = ConfigDict(from_attributes=True)

