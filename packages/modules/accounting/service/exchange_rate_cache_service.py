"""Exchange rate caching — avoids hitting external APIs on every call."""
from __future__ import annotations
import logging
from datetime import date, timedelta
from typing import Any
from sqlalchemy import Column, Integer, String, Float, Date, DateTime
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session
from apps.api.db import Base

_log = logging.getLogger(__name__)


class CachedExchangeRate(Base):
    __tablename__ = "cached_exchange_rates"
    id = Column(Integer, primary_key=True, autoincrement=True)
    from_currency = Column(String(3), nullable=False, index=True)
    to_currency = Column(String(3), nullable=False, index=True)
    rate = Column(Float, nullable=False)
    rate_date = Column(Date, nullable=False, index=True)
    source = Column(String(64), nullable=False, default="open_er_api")
    created_at = Column(DateTime, nullable=False, server_default=sa_func.now())


def get_rate(db: Session, from_currency: str, to_currency: str, *, rate_date: date | None = None) -> float | None:
    if rate_date is None: rate_date = date.today()
    cached = db.query(CachedExchangeRate).filter(CachedExchangeRate.from_currency == from_currency,
        CachedExchangeRate.to_currency == to_currency, CachedExchangeRate.rate_date == rate_date).first()
    if cached: return cached.rate
    try:
        import requests
        r = requests.get(f"https://open.er-api.com/v6/latest/{from_currency}", timeout=5)
        r.raise_for_status()
        data = r.json()
        rate = data.get("rates", {}).get(to_currency)
        if rate is None: return None
        row = CachedExchangeRate(from_currency=from_currency, to_currency=to_currency,
            rate=rate, rate_date=rate_date, source="open_er_api")
        db.add(row)
        db.commit()
        return rate
    except Exception as e:
        _log.warning("Failed to fetch %s->%s: %s", from_currency, to_currency, e)
        yesterday = rate_date - timedelta(days=1)
        fallback = db.query(CachedExchangeRate).filter(CachedExchangeRate.from_currency == from_currency,
            CachedExchangeRate.to_currency == to_currency, CachedExchangeRate.rate_date >= yesterday
        ).order_by(CachedExchangeRate.rate_date.desc()).first()
        return fallback.rate if fallback else None


def convert_amount(db: Session, amount: float, from_currency: str, to_currency: str) -> float | None:
    if from_currency == to_currency: return amount
    rate = get_rate(db, from_currency, to_currency)
    return round(amount * rate, 2) if rate else None
