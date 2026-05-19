"""Salary configuration service — CRUD for user hourly rates.

Accountants use this to assign hourly rates to employees so that
time reports can be costed (hours x rate = cost).
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from packages.modules.time_tracking.models_salary import UserSalaryConfig


# ── Read ───────────────────────────────────────────────────────────────────────

def get_active_salary(db: Session, company_id: int, user_id: int) -> UserSalaryConfig | None:
    """Return the currently active salary config for a user."""
    return (
        db.query(UserSalaryConfig)
        .filter(
            UserSalaryConfig.company_id == company_id,
            UserSalaryConfig.user_id == user_id,
            UserSalaryConfig.is_active.is_(True),
        )
        .order_by(UserSalaryConfig.effective_date.desc())
        .first()
    )


def list_salary_configs(db: Session, company_id: int) -> list[UserSalaryConfig]:
    """List all active salary configs for a company."""
    return (
        db.query(UserSalaryConfig)
        .filter(
            UserSalaryConfig.company_id == company_id,
            UserSalaryConfig.is_active.is_(True),
        )
        .order_by(UserSalaryConfig.user_id, UserSalaryConfig.effective_date.desc())
        .all()
    )


def get_hourly_rate(db: Session, company_id: int, user_id: int) -> Decimal:
    """Get the active hourly rate for a user, or 0 if not configured."""
    config = get_active_salary(db, company_id, user_id)
    return config.hourly_rate if config else Decimal("0")


# ── Create / Update ────────────────────────────────────────────────────────────

def set_salary(
    db: Session,
    company_id: int,
    user_id: int,
    hourly_rate: Decimal,
    monthly_salary: Decimal | None = None,
    currency: str = "MXN",
    effective_date: date | None = None,
    role_title: str | None = None,
    default_cost_center_id: int | None = None,
    default_project_id: int | None = None,
    notes: str | None = None,
    created_by: int | None = None,
) -> UserSalaryConfig:
    """Set or update the hourly rate for a user.

    Deactivates any previous active config for the same user,
    then creates a new active one.
    """
    # Deactivate previous active configs
    existing = (
        db.query(UserSalaryConfig)
        .filter(
            UserSalaryConfig.company_id == company_id,
            UserSalaryConfig.user_id == user_id,
            UserSalaryConfig.is_active.is_(True),
        )
        .all()
    )
    for cfg in existing:
        cfg.is_active = False

    config = UserSalaryConfig(
        company_id=company_id,
        user_id=user_id,
        hourly_rate=hourly_rate,
        monthly_salary=monthly_salary,
        currency=currency,
        effective_date=effective_date or date.today(),
        is_active=True,
        role_title=role_title,
        default_cost_center_id=default_cost_center_id,
        default_project_id=default_project_id,
        notes=notes,
        created_by=created_by,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


# ── Time cost calculation ──────────────────────────────────────────────────────

def calculate_time_cost(
    db: Session,
    company_id: int,
    user_id: int,
    hours: Decimal,
) -> Decimal:
    """Calculate cost for a user's hours: hours x hourly_rate."""
    rate = get_hourly_rate(db, company_id, user_id)
    return hours * rate


def batch_time_costs(
    db: Session,
    company_id: int,
    user_hours: list[tuple[int, Decimal]],
) -> dict[int, Decimal]:
    """Calculate costs for multiple users at once.

    Args:
        user_hours: list of (user_id, hours) tuples

    Returns:
        dict mapping user_id -> total_cost
    """
    result: dict[int, Decimal] = {}
    # Batch load all active configs
    configs = (
        db.query(UserSalaryConfig)
        .filter(
            UserSalaryConfig.company_id == company_id,
            UserSalaryConfig.is_active.is_(True),
        )
        .all()
    )
    rate_map: dict[int, Decimal] = {}
    for cfg in configs:
        if cfg.user_id not in rate_map:
            rate_map[cfg.user_id] = cfg.hourly_rate

    for user_id, hours in user_hours:
        rate = rate_map.get(user_id, Decimal("0"))
        result[user_id] = hours * rate

    return result
