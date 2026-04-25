"""poliza_simulator_service.py — builds a balanced journal entry preview.

Input: an expense (real or sample) + the company's CoA + IVA config.
Output: a list of journal entry lines (debit/credit) with their GL account
codes, ready to be rendered in the Motor de Pólizas UI or serialised to
COI/CONTPAQ/XML at export time.

The simulator is deliberately stateless and pure — no DB writes, no side
effects. It mirrors how the future real exporter will compute entries so the
admin UI can show the exact output ahead of time.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from packages.core.platform.models_accounting_account  import AccountingAccount
from packages.core.platform.models_accounting_category import AccountingCategory
from packages.core.platform.models_tax_rate            import TaxRate


# ── Types ─────────────────────────────────────────────────────────────────────

Line = dict[str, Any]  # { account_code, account_name, debit, credit, note }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


def _load_account(db: Session, account_id: int | None) -> AccountingAccount | None:
    if account_id is None:
        return None
    return db.query(AccountingAccount).filter(AccountingAccount.id == account_id).first()


def _account_code_with_split(
    account: AccountingAccount | None,
    expense: dict[str, Any],
) -> tuple[str, str]:
    """Return (code, name) for *account*, suffixed by the split dimension."""
    if account is None:
        return ("?", "(sin cuenta mapeada)")

    code = account.code
    name = account.name
    if account.split_by == "cost_center" and expense.get("cost_center_code"):
        code = f"{code}-{expense['cost_center_code']}"
    elif account.split_by == "project" and expense.get("project_code"):
        code = f"{code}-{expense['project_code']}"
    elif account.split_by == "client" and expense.get("client_code"):
        code = f"{code}-{expense['client_code']}"
    return (code, name)


# ── Public entry point ────────────────────────────────────────────────────────

def simulate_poliza(
    db: Session,
    company_id: int,
    expense: dict[str, Any],
) -> dict[str, Any]:
    """Return the journal-entry preview for *expense*.

    *expense* is a loose dict so callers can pass a real ORM Expense dump or
    a synthetic sample. Required keys: `amount` (total, incl. tax),
    `category_code`. Optional: `cost_center_code`, `project_code`,
    `client_code`, `description`, `vendor`, `date`.

    Return shape:
        {
            "lines":      list[Line],
            "balanced":   bool,
            "total_debit": str,
            "total_credit": str,
            "warnings":   list[str],
        }
    """
    warnings: list[str] = []
    amount_total = Decimal(str(expense.get("amount") or 0))
    if amount_total <= 0:
        return {
            "lines":        [],
            "balanced":     False,
            "total_debit":  "0.00",
            "total_credit": "0.00",
            "warnings":     ["El gasto no tiene un monto válido."],
        }

    cat_code = (expense.get("category_code") or "").strip()
    category: AccountingCategory | None = None
    if cat_code:
        category = (
            db.query(AccountingCategory)
            .filter(
                AccountingCategory.company_id == company_id,
                AccountingCategory.code == cat_code,
                AccountingCategory.is_active.is_(True),
            )
            .first()
        )

    if category is None:
        warnings.append(f"Sin categoría mapeada ({cat_code or 'vacía'}).")

    expense_account = _load_account(db, category.expense_account_id) if category else None
    counter_account = _load_account(db, category.counterparty_account_id) if category else None

    rate: TaxRate | None = None
    if category and category.tax_rate_id is not None:
        rate = db.query(TaxRate).filter(TaxRate.id == category.tax_rate_id).first()

    # ── Split amount into base + IVA ───────────────────────────────────────
    # Conventions: we treat `amount` as the gross total including any
    # traspasable IVA (matches how CFDI `total` is stored).
    base = amount_total
    iva_amount = Decimal("0.00")
    iva_creditable = False
    iva_exempt     = False

    if rate is not None and rate.rate > 0:
        if rate.behavior in ("acreditable", "no_acreditable", "trasladable"):
            # gross = base * (1 + rate) → base = gross / (1 + rate)
            base = _q(amount_total / (Decimal("1") + rate.rate))
            iva_amount = _q(amount_total - base)
            iva_creditable = rate.behavior == "acreditable"
        elif rate.behavior == "exento":
            iva_exempt = True
    else:
        iva_exempt = True

    # ── Build lines ────────────────────────────────────────────────────────
    lines: list[Line] = []

    # If IVA is non-acreditable, it lands in the expense account (gross stays
    # as the debit).
    debit_amount = amount_total if (rate and rate.behavior == "no_acreditable") else base
    exp_code, exp_name = _account_code_with_split(expense_account, expense)
    lines.append({
        "account_code": exp_code,
        "account_name": exp_name,
        "debit":        f"{_q(debit_amount):.2f}",
        "credit":       "0.00",
        "note":         "Gasto",
    })

    if iva_creditable and rate is not None:
        iva_account = _load_account(db, rate.gl_account_id)
        iva_code, iva_name = _account_code_with_split(iva_account, expense)
        lines.append({
            "account_code": iva_code,
            "account_name": iva_name,
            "debit":        f"{_q(iva_amount):.2f}",
            "credit":       "0.00",
            "note":         f"IVA acreditable ({float(rate.rate)*100:.0f}%)",
        })

    # Counterparty (credit side)
    cp_code, cp_name = _account_code_with_split(counter_account, expense)
    lines.append({
        "account_code": cp_code,
        "account_name": cp_name,
        "debit":        "0.00",
        "credit":       f"{_q(amount_total):.2f}",
        "note":         "Contrapartida",
    })

    total_debit  = sum((Decimal(ln["debit"])  for ln in lines), start=Decimal("0"))
    total_credit = sum((Decimal(ln["credit"]) for ln in lines), start=Decimal("0"))
    balanced     = total_debit == total_credit

    # Soft warnings
    if expense_account is None:
        warnings.append("La categoría no tiene cuenta de gasto asignada.")
    if counter_account is None:
        warnings.append("La categoría no tiene contrapartida asignada.")
    if iva_exempt and rate is None and category is not None:
        warnings.append("La categoría no tiene tasa de IVA asignada.")

    return {
        "lines":        lines,
        "balanced":     balanced,
        "total_debit":  f"{_q(total_debit):.2f}",
        "total_credit": f"{_q(total_credit):.2f}",
        "warnings":     warnings,
    }
