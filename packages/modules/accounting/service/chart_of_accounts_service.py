"""chart_of_accounts_service.py — CRUD + preset loader for the CoA + IVA engine.

Exposes:
  * list_accounts(db, company_id, include_inactive=False)
  * upsert_account(db, company_id, data)
  * delete_account(db, account_id)
  * list_tax_rates(db, company_id)
  * upsert_tax_rate(db, company_id, data)
  * delete_tax_rate(db, rate_id)
  * apply_preset(db, company_id, preset_name)  — seeds Plan Básico and binds categories
  * load_sat_reference()                       — static Código Agrupador catalog
"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy.orm import Session

from packages.core.platform.models_accounting_account  import AccountingAccount, ACCOUNT_CLASS_VALUES, SPLIT_BY_VALUES
from packages.core.platform.models_accounting_category import AccountingCategory
from packages.core.platform.models_tax_rate            import TaxRate, TAX_BEHAVIOR_VALUES

_KNOWLEDGE_DIR = Path(__file__).resolve().parents[1] / "knowledge"


# ── SAT reference ─────────────────────────────────────────────────────────────

def load_sat_reference() -> dict[str, Any]:
    """Return the SAT Código Agrupador reference catalog (static, non-tenant)."""
    with (_KNOWLEDGE_DIR / "sat_codigo_agrupador.yaml").open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


# ── Accounts ──────────────────────────────────────────────────────────────────

def list_accounts(db: Session, company_id: int, *, include_inactive: bool = False) -> list[AccountingAccount]:
    q = db.query(AccountingAccount).filter(AccountingAccount.company_id == company_id)
    if not include_inactive:
        q = q.filter(AccountingAccount.is_active.is_(True))
    return q.order_by(AccountingAccount.sort_order, AccountingAccount.code).all()


def get_account_by_code(db: Session, company_id: int, code: str) -> AccountingAccount | None:
    return (
        db.query(AccountingAccount)
        .filter(AccountingAccount.company_id == company_id, AccountingAccount.code == code)
        .first()
    )


def upsert_account(db: Session, company_id: int, data: dict[str, Any]) -> AccountingAccount:
    code = str(data["code"]).strip()
    row  = get_account_by_code(db, company_id, code)

    account_class = data.get("account_class", "expense")
    if account_class not in ACCOUNT_CLASS_VALUES:
        raise ValueError(f"Invalid account_class '{account_class}'")

    split_by = data.get("split_by", "none")
    if split_by not in SPLIT_BY_VALUES:
        raise ValueError(f"Invalid split_by '{split_by}'")

    fields = {
        "name":           data["name"],
        "parent_id":      data.get("parent_id"),
        "sat_group_code": data.get("sat_group_code"),
        "account_class":  account_class,
        "is_postable":    bool(data.get("is_postable", True)),
        "split_by":       split_by,
        "sort_order":     int(data.get("sort_order", 0)),
        "is_active":      bool(data.get("is_active", True)),
    }

    if row:
        for k, v in fields.items():
            setattr(row, k, v)
    else:
        row = AccountingAccount(company_id=company_id, code=code, **fields)
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_account(db: Session, account_id: int) -> None:
    row = db.query(AccountingAccount).filter(AccountingAccount.id == account_id).first()
    if row:
        db.delete(row)
        db.commit()


# ── Tax rates ─────────────────────────────────────────────────────────────────

def list_tax_rates(db: Session, company_id: int) -> list[TaxRate]:
    return (
        db.query(TaxRate)
        .filter(TaxRate.company_id == company_id, TaxRate.is_active.is_(True))
        .order_by(TaxRate.name)
        .all()
    )


def upsert_tax_rate(db: Session, company_id: int, data: dict[str, Any]) -> TaxRate:
    name = str(data["name"]).strip()
    if data.get("behavior") not in TAX_BEHAVIOR_VALUES:
        raise ValueError(f"Invalid tax behavior '{data.get('behavior')}'")

    row = (
        db.query(TaxRate)
        .filter(TaxRate.company_id == company_id, TaxRate.name == name)
        .first()
    )
    fields = {
        "rate":           Decimal(str(data["rate"])),
        "behavior":       data["behavior"],
        "gl_account_id":  data.get("gl_account_id"),
        "is_active":      bool(data.get("is_active", True)),
    }
    if row:
        for k, v in fields.items():
            setattr(row, k, v)
    else:
        row = TaxRate(company_id=company_id, name=name, **fields)
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


def delete_tax_rate(db: Session, rate_id: int) -> None:
    row = db.query(TaxRate).filter(TaxRate.id == rate_id).first()
    if row:
        db.delete(row)
        db.commit()


# ── Preset loader ─────────────────────────────────────────────────────────────

def apply_preset(db: Session, company_id: int, preset_name: str = "plan_basico") -> dict[str, int]:
    """Seed a preset CoA + tax-rate set for *company_id*.

    Upsert semantics:
      * existing accounts with the same code are updated in place;
      * existing tax rates with the same name are updated;
      * existing AccountingCategory rows that share a preset code are bound
        to the preset's account + tax rate.

    Returns counts of touched rows.
    """
    preset_path = _KNOWLEDGE_DIR / f"preset_{preset_name}.yaml"
    if not preset_path.exists():
        raise FileNotFoundError(f"Unknown preset '{preset_name}'")

    with preset_path.open("r", encoding="utf-8") as fh:
        preset = yaml.safe_load(fh) or {}

    accounts_created_or_updated = 0
    rates_created_or_updated    = 0
    categories_bound            = 0

    # 1) Accounts first (tax rates FK them).
    # Two-pass: insert all rows first, then resolve `parent` (parent code)
    # to parent_id so forward references work regardless of YAML order.
    code_to_id: dict[str, int] = {}
    parent_map: dict[str, str] = {}  # child code → parent code
    raw_accounts = preset.get("accounts", []) or []
    for idx, acc in enumerate(raw_accounts):
        row = upsert_account(db, company_id, {
            "code":           acc["code"],
            "name":           acc["name"],
            "sat_group_code": acc.get("sat") or acc["code"],
            "account_class":  acc.get("class", "expense"),
            "is_postable":    bool(acc.get("postable", True)),
            "split_by":       acc.get("split_by", "none"),
            "sort_order":     idx,
        })
        code_to_id[row.code] = row.id
        if acc.get("parent"):
            parent_map[row.code] = str(acc["parent"])
        accounts_created_or_updated += 1

    # Pass 2: link parents now that every code has an id.
    for child_code, parent_code in parent_map.items():
        parent_id = code_to_id.get(parent_code)
        if parent_id is None:
            continue
        child = db.query(AccountingAccount).filter(
            AccountingAccount.id == code_to_id[child_code]
        ).first()
        if child and child.parent_id != parent_id:
            child.parent_id = parent_id
    if parent_map:
        db.commit()

    # 2) Tax rates.
    name_to_rate_id: dict[str, int] = {}
    for tr in preset.get("tax_rates", []) or []:
        gl_code = tr.get("gl_account")
        row = upsert_tax_rate(db, company_id, {
            "name":          tr["name"],
            "rate":          tr["rate"],
            "behavior":      tr["behavior"],
            "gl_account_id": code_to_id.get(gl_code) if gl_code else None,
        })
        name_to_rate_id[row.name] = row.id
        rates_created_or_updated += 1

    # 3) Bind existing AccountingCategory rows if their code matches a preset.
    bindings = preset.get("category_bindings", {}) or {}
    if bindings:
        existing = {
            c.code: c for c in db.query(AccountingCategory).filter(
                AccountingCategory.company_id == company_id
            )
        }
        for cat_code, cfg in bindings.items():
            cat = existing.get(cat_code)
            if not cat:
                continue
            cat.expense_account_id       = code_to_id.get(cfg.get("account"))
            cat.tax_rate_id              = name_to_rate_id.get(cfg.get("tax"))
            cat.counterparty_account_id  = code_to_id.get(cfg.get("counterparty"))
            categories_bound += 1
        db.commit()

    return {
        "accounts":   accounts_created_or_updated,
        "tax_rates":  rates_created_or_updated,
        "categories_bound": categories_bound,
    }
