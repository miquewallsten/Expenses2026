"""accounting_category_seed_service.py

Persists a list of accounting category dicts into the DB for a given company.

Design notes
------------
* Upsert semantics: if a row with the same (company_id, code) already exists
  it is updated in-place; otherwise a new row is inserted.
* A single db.commit() is issued after processing all items.
* Returns the list of ORM rows (created or updated) in input order.
"""

from sqlalchemy.orm import Session

from packages.core.platform.models_accounting_category import AccountingCategory


def seed_accounting_categories(
    db: Session,
    company_id: int,
    items: list[dict],
) -> list[AccountingCategory]:
    """
    Insert or update AccountingCategory rows for *company_id*.

    Parameters
    ----------
    db : Session
    company_id : int
        Injected into every row; overrides any company_id present in *items*.
    items : list[dict]
        Each dict must contain at least ``code`` and ``name``.
        Optional keys: ``expense_account_code``, ``liability_account_code``,
        ``tax_behavior``, ``requires_project``.

    Returns
    -------
    list[AccountingCategory]
        Rows in the same order as *items*, after commit.
    """
    # Pre-load existing codes for this company in one query to avoid N+1.
    existing: dict[str, AccountingCategory] = {
        row.code: row
        for row in db.query(AccountingCategory).filter(
            AccountingCategory.company_id == company_id
        )
    }

    results: list[AccountingCategory] = []

    for item in items:
        code = str(item.get("code", "")).strip()
        if not code:
            continue  # skip malformed entries silently

        if code in existing:
            # Update in-place.
            row = existing[code]
            row.name                   = item.get("name", row.name)
            row.expense_account_code   = item.get("expense_account_code",   row.expense_account_code)
            row.liability_account_code = item.get("liability_account_code", row.liability_account_code)
            row.tax_behavior           = item.get("tax_behavior",           row.tax_behavior)
            row.requires_project       = bool(item.get("requires_project",  row.requires_project))
            row.is_active              = True  # re-activate if previously deactivated
        else:
            row = AccountingCategory(
                company_id             = company_id,
                code                   = code,
                name                   = item.get("name", code),
                expense_account_code   = item.get("expense_account_code"),
                liability_account_code = item.get("liability_account_code"),
                tax_behavior           = item.get("tax_behavior", "none"),
                requires_project       = bool(item.get("requires_project", False)),
            )
            db.add(row)
            existing[code] = row  # guard against duplicate codes within the same input list

        results.append(row)

    db.commit()

    # Refresh all rows so callers get server-populated fields (id, created_at, etc.)
    for row in results:
        db.refresh(row)

    return results
