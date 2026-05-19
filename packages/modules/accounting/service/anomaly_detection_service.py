"""Anomaly detection service — duplicates, unusual patterns, policy violations."""
from __future__ import annotations
import logging
from collections import Counter
from datetime import date, timedelta
from typing import Any
from sqlalchemy import func
from sqlalchemy.orm import Session
from packages.modules.expenses.models.expense import Expense

_log = logging.getLogger(__name__)


def detect_duplicates(db: Session, company_id: int, *, days_back: int = 90) -> list[dict[str, Any]]:
    cutoff = date.today() - timedelta(days=days_back)
    dupes = (db.query(Expense.amount, Expense.expense_date, Expense.description, func.count(Expense.id).label("cnt"))
        .filter(Expense.company_id == company_id, Expense.expense_date >= cutoff, Expense.status != "rejected")
        .group_by(Expense.amount, Expense.expense_date, Expense.description)
        .having(func.count(Expense.id) > 1).all())
    findings = []
    for amount, exp_date, description, cnt in dupes:
        rows = db.query(Expense).filter(Expense.company_id == company_id,
            Expense.amount == amount, Expense.expense_date == exp_date,
            Expense.description == description, Expense.status != "rejected").all()
        findings.append({"type": "potential_duplicate", "severity": "warn",
            "description": f"{cnt} gastos con mismo monto ${amount}, fecha {exp_date}, '{(description or '')[:50]}'",
            "expense_ids": [e.id for e in rows], "amount": float(amount or 0),
            "expense_date": exp_date.isoformat() if exp_date else None})
    return findings


def detect_unusual_patterns(db: Session, company_id: int, *, days_back: int = 90) -> list[dict[str, Any]]:
    cutoff = date.today() - timedelta(days=days_back)
    expenses = db.query(Expense).filter(Expense.company_id == company_id,
        Expense.expense_date >= cutoff, Expense.status != "rejected").all()
    findings = []
    # Weekend expenses
    weekend = [e for e in expenses if e.expense_date and e.expense_date.weekday() >= 5]
    if len(weekend) > 3:
        findings.append({"type": "weekend_expenses", "severity": "info",
            "description": f"{len(weekend)} gastos en fin de semana", "count": len(weekend),
            "expense_ids": [e.id for e in weekend[:10]]})
    # High-value
    if expenses:
        amounts = sorted([float(e.amount or 0) for e in expenses], reverse=True)
        if amounts:
            threshold = amounts[max(0, len(amounts) // 20)]
            high_value = [e for e in expenses if float(e.amount or 0) >= threshold and float(e.amount or 0) > 10000]
            if high_value:
                findings.append({"type": "high_value_expenses", "severity": "info",
                    "description": f"{len(high_value)} gastos de alto valor", "count": len(high_value),
                    "total_amount": sum(float(e.amount or 0) for e in high_value),
                    "expense_ids": [e.id for e in high_value[:10]]})
    # Missing description
    no_desc = [e for e in expenses if not e.description or len(e.description.strip()) < 5]
    if len(no_desc) > 5:
        findings.append({"type": "missing_description", "severity": "info",
            "description": f"{len(no_desc)} gastos sin descripción", "count": len(no_desc),
            "expense_ids": [e.id for e in no_desc[:10]]})
    # Frequent vendors
    vendor_counts = Counter()
    for e in expenses:
        desc = (e.description or "").strip()[:80]
        if desc:
            vendor_counts[desc] += 1
    frequent = {k: v for k, v in vendor_counts.items() if v >= 5}
    if frequent:
        top = sorted(frequent.items(), key=lambda x: -x[1])[:5]
        findings.append({"type": "frequent_vendor", "severity": "info",
            "description": f"Proveedores frecuentes: {', '.join(f'{v} ({c}x)' for v, c in top)}",
            "vendors": [{"name": v, "count": c} for v, c in top]})
    return findings


def detect_policy_violations(db: Session, company_id: int, *, days_back: int = 90) -> list[dict[str, Any]]:
    from packages.core.platform.models_expense_policy import CompanyExpensePolicy
    cutoff = date.today() - timedelta(days=days_back)
    policy = db.query(CompanyExpensePolicy).filter(CompanyExpensePolicy.company_id == company_id).first()
    if not policy:
        return []
    expenses = db.query(Expense).filter(Expense.company_id == company_id,
        Expense.expense_date >= cutoff, Expense.status != "rejected").all()
    findings = []
    if policy.spending_limit:
        over = [e for e in expenses if float(e.amount or 0) > policy.spending_limit]
        if over:
            findings.append({"type": "over_spending_limit", "severity": "critical",
                "description": f"{len(over)} gastos exceden límite ${policy.spending_limit:,.0f}",
                "count": len(over), "limit": float(policy.spending_limit),
                "expense_ids": [e.id for e in over[:10]]})
    if getattr(policy, "xml_required_mode", "optional") in ("required", "strict"):
        no_cfdi = [e for e in expenses if not e.cfdi_uuid and e.status in ("approved", "manager_approved")]
        if no_cfdi:
            findings.append({"type": "missing_cfdi", "severity": "critical",
                "description": f"{len(no_cfdi)} gastos sin CFDI", "count": len(no_cfdi),
                "expense_ids": [e.id for e in no_cfdi[:10]]})
    if policy.allowed_categories:
        disallowed = [e for e in expenses if e.category_code and e.category_code not in (policy.allowed_categories or [])]
        if disallowed:
            findings.append({"type": "disallowed_category", "severity": "warn",
                "description": f"{len(disallowed)} gastos en categorías no permitidas",
                "count": len(disallowed), "expense_ids": [e.id for e in disallowed[:10]]})
    return findings


def run_full_scan(db: Session, company_id: int, *, days_back: int = 90) -> list[dict[str, Any]]:
    findings = []
    findings.extend(detect_duplicates(db, company_id, days_back=days_back))
    findings.extend(detect_unusual_patterns(db, company_id, days_back=days_back))
    findings.extend(detect_policy_violations(db, company_id, days_back=days_back))
    severity_order = {"critical": 0, "warn": 1, "info": 2}
    findings.sort(key=lambda f: severity_order.get(f.get("severity", "info"), 2))
    return findings
