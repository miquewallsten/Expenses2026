from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ReportCycleSettingsBase(BaseModel):
    enabled: bool = True
    frequency: str = "monthly"          # "weekly" | "biweekly" | "monthly" | "manual"
    day_of_week: Optional[int] = None   # 0=Mon … 6=Sun  (weekly / biweekly)
    day_of_month: Optional[int] = 1     # 1–28           (monthly)
    time_of_day: str = "18:00"          # HH:MM 24h in company timezone
    auto_submit: bool = True
    bundle_statuses: str = "submitted,manager_approved"
    report_name_template: str = "{user} — {month} {year}"


class ReportCycleSettingsUpdate(BaseModel):
    enabled: Optional[bool] = None
    frequency: Optional[str] = None
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    time_of_day: Optional[str] = None
    auto_submit: Optional[bool] = None
    bundle_statuses: Optional[str] = None
    report_name_template: Optional[str] = None


class ReportCycleSettingsRead(ReportCycleSettingsBase):
    id: int
    company_id: int
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BundleResult(BaseModel):
    """Returned by the manual trigger and the scheduled bundler."""
    reports_created: int
    expenses_bundled: int
    users_processed: int
    skipped_users: int          # users with 0 qualifying expenses
    report_ids: list[int]
    triggered_by: str
