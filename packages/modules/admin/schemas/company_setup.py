from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CompanySetupBase(BaseModel):
    company_id: int
    display_name: str | None = None
    logo_url: str | None = None
    country_code: str | None = None
    base_currency: str | None = None
    timezone: str | None = None
    language_code: str | None = None
    industry: str | None = None
    employee_count_range: str | None = None
    has_managers: bool = False
    has_accounting_team: bool = True
    has_subcontractors: bool = False
    operates_multi_entity: bool = False
    operates_multi_country: bool = False
    allocation_dimensions: str = "project_client_cost_center"
    allow_split_allocations: bool = True
    expenses_module_enabled: bool = True
    time_allocation_module_enabled: bool = False
    subcontractor_module_enabled: bool = False
    approvals_module_enabled: bool = True
    accounting_module_enabled: bool = True
    archive_module_enabled: bool = True
    purchase_requests_module_enabled: bool = False
    ai_copilot_enabled: bool = True
    agent_v2_enabled: bool = True
    ai_setup_completed: bool = False
    ai_setup_notes: str | None = None
    ai_setup_last_summary: str | None = None
    company_profile_narrative: str | None = None


class CompanySetupCreate(CompanySetupBase):
    pass


class CompanySetupUpdate(BaseModel):
    display_name: str | None = None
    logo_url: str | None = None
    country_code: str | None = None
    base_currency: str | None = None
    timezone: str | None = None
    language_code: str | None = None
    industry: str | None = None
    employee_count_range: str | None = None
    has_managers: bool | None = None
    has_accounting_team: bool | None = None
    has_subcontractors: bool | None = None
    operates_multi_entity: bool | None = None
    operates_multi_country: bool | None = None
    allocation_dimensions: str | None = None
    allow_split_allocations: bool | None = None
    expenses_module_enabled: bool | None = None
    time_allocation_module_enabled: bool | None = None
    subcontractor_module_enabled: bool | None = None
    approvals_module_enabled: bool | None = None
    accounting_module_enabled: bool | None = None
    archive_module_enabled: bool | None = None
    purchase_requests_module_enabled: bool | None = None
    ai_copilot_enabled: bool | None = None
    agent_v2_enabled: bool | None = None
    ai_setup_completed: bool | None = None
    ai_setup_notes: str | None = None
    ai_setup_last_summary: str | None = None
    company_profile_narrative: str | None = None


class CompanySetupRead(CompanySetupBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
