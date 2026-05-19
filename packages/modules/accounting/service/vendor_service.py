"""Vendor service — manage vendors with RFC, payment terms, retention rules."""
from __future__ import annotations
import logging
from typing import Any
from sqlalchemy import Boolean, Column, Integer, String, Text, DateTime, Float
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session
from apps.api.db import Base

_log = logging.getLogger(__name__)


class Vendor(Base):
    __tablename__ = "vendors"
    id = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    rfc = Column(String(13), nullable=True)
    legal_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    vendor_type = Column(String(32), nullable=False, default="supplier")
    payment_terms_days = Column(Integer, nullable=True, default=30)
    isr_retention_pct = Column(Float, nullable=True, default=0.0)
    iva_retention_pct = Column(Float, nullable=True, default=0.0)
    default_category_code = Column(String(32), nullable=True)
    default_account_code = Column(String(32), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=sa_func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=sa_func.now())


def create_vendor(db: Session, *, company_id: int, name: str, rfc: str | None = None,
    legal_name: str | None = None, vendor_type: str = "supplier", payment_terms_days: int = 30,
    isr_retention_pct: float = 0.0, iva_retention_pct: float = 0.0,
    default_category_code: str | None = None, default_account_code: str | None = None,
    notes: str | None = None) -> Vendor:
    v = Vendor(company_id=company_id, name=name, rfc=rfc, legal_name=legal_name,
        vendor_type=vendor_type, payment_terms_days=payment_terms_days,
        isr_retention_pct=isr_retention_pct, iva_retention_pct=iva_retention_pct,
        default_category_code=default_category_code, default_account_code=default_account_code, notes=notes)
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


def list_vendors(db: Session, company_id: int, *, vendor_type: str | None = None, active_only: bool = True) -> list[Vendor]:
    q = db.query(Vendor).filter(Vendor.company_id == company_id)
    if active_only: q = q.filter(Vendor.is_active == True)
    if vendor_type: q = q.filter(Vendor.vendor_type == vendor_type)
    return q.order_by(Vendor.name).all()


def get_vendor_by_rfc(db: Session, company_id: int, rfc: str) -> Vendor | None:
    return db.query(Vendor).filter(Vendor.company_id == company_id, Vendor.rfc == rfc, Vendor.is_active == True).first()


def update_vendor(db: Session, vendor_id: int, **kwargs) -> Vendor | None:
    v = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not v: return None
    for k, val in kwargs.items():
        if hasattr(v, k): setattr(v, k, val)
    db.commit()
    db.refresh(v)
    return v


def deactivate_vendor(db: Session, vendor_id: int) -> bool:
    v = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not v: return False
    v.is_active = False
    db.commit()
    return True
