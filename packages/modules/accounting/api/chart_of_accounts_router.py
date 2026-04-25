"""chart_of_accounts_router.py — REST API for the Motor de Pólizas backend.

Routes (all /admin/coa):
  GET    /{company_id}/accounts
  PUT    /{company_id}/accounts                — upsert a single account
  DELETE /accounts/{account_id}

  GET    /{company_id}/tax-rates
  PUT    /{company_id}/tax-rates               — upsert a tax rate
  DELETE /tax-rates/{rate_id}

  POST   /{company_id}/apply-preset            — body {preset: "plan_basico"}
  POST   /{company_id}/simulate                — body {expense: {...}}

  GET    /sat-reference                        — static SAT Código Agrupador
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from apps.api.auth import require_admin
from apps.api.deps import get_db
from packages.modules.accounting.service.bulk_simulator_service import bulk_simulate
from packages.modules.accounting.service.poliza_export_service import (
    list_custom_placeholders,
    render_coi,
    render_contpaqi,
    render_custom,
    render_sat_polizas,
)
from packages.modules.accounting.service.chart_of_accounts_service import (
    apply_preset,
    delete_account,
    delete_tax_rate,
    list_accounts,
    list_tax_rates,
    load_sat_reference,
    upsert_account,
    upsert_tax_rate,
)
from packages.modules.accounting.service.coa_import_service import (
    ai_normalize_accounts,
    ai_suggest_mappings,
    import_accounts_csv,
)
from packages.modules.accounting.service.poliza_simulator_service import simulate_poliza

router = APIRouter(prefix="/admin/coa", tags=["admin"], dependencies=[Depends(require_admin)])


# ── Schemas ───────────────────────────────────────────────────────────────────

class AccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    parent_id: int | None
    sat_group_code: str | None
    account_class: str
    is_postable: bool
    split_by: str
    sort_order: int
    is_active: bool


class AccountUpsert(BaseModel):
    code: str
    name: str
    parent_id: int | None = None
    sat_group_code: str | None = None
    account_class: str = "expense"
    is_postable: bool = True
    split_by: str = "none"
    sort_order: int = 0
    is_active: bool = True


class TaxRateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    rate: float
    behavior: str
    gl_account_id: int | None
    is_active: bool


class TaxRateUpsert(BaseModel):
    name: str
    rate: float
    behavior: str
    gl_account_id: int | None = None
    is_active: bool = True


class ApplyPresetBody(BaseModel):
    preset: str = "plan_basico"


class SimulateBody(BaseModel):
    expense: dict[str, Any]


class ImportCsvBody(BaseModel):
    csv_text: str


class AiSuggestBody(BaseModel):
    hint: str = ""
    only_unmapped: bool = True


class AiNormalizeBody(BaseModel):
    raw_text: str
    hint: str = ""


class BulkBindingsBody(BaseModel):
    bindings: list[dict[str, Any]]  # [{category_id, expense_account_id, tax_rate_id, counterparty_account_id}]


# ── Accounts ──────────────────────────────────────────────────────────────────

@router.get("/{company_id}/accounts", response_model=list[AccountRead])
def get_accounts(company_id: int, db: Session = Depends(get_db)):
    return list_accounts(db, company_id)


@router.put("/{company_id}/accounts", response_model=AccountRead)
def put_account(company_id: int, body: AccountUpsert, db: Session = Depends(get_db)):
    return upsert_account(db, company_id, body.model_dump())


@router.delete("/accounts/{account_id}", status_code=204)
def del_account(account_id: int, db: Session = Depends(get_db)):
    delete_account(db, account_id)
    return None


# ── Tax rates ────────────────────────────────────────────────────────────────

@router.get("/{company_id}/tax-rates", response_model=list[TaxRateRead])
def get_tax_rates(company_id: int, db: Session = Depends(get_db)):
    return list_tax_rates(db, company_id)


@router.put("/{company_id}/tax-rates", response_model=TaxRateRead)
def put_tax_rate(company_id: int, body: TaxRateUpsert, db: Session = Depends(get_db)):
    return upsert_tax_rate(db, company_id, body.model_dump())


@router.delete("/tax-rates/{rate_id}", status_code=204)
def del_tax_rate(rate_id: int, db: Session = Depends(get_db)):
    delete_tax_rate(db, rate_id)
    return None


# ── Presets + simulator + SAT ────────────────────────────────────────────────

@router.post("/{company_id}/apply-preset")
def post_apply_preset(company_id: int, body: ApplyPresetBody, db: Session = Depends(get_db)):
    return apply_preset(db, company_id, body.preset)


@router.post("/{company_id}/simulate")
def post_simulate(company_id: int, body: SimulateBody, db: Session = Depends(get_db)):
    return simulate_poliza(db, company_id, body.expense)


@router.get("/sat-reference")
def get_sat_reference():
    return load_sat_reference()


# ── Import + AI ──────────────────────────────────────────────────────────────

@router.post("/{company_id}/import-accounts")
def post_import_accounts(company_id: int, body: ImportCsvBody, db: Session = Depends(get_db)):
    return import_accounts_csv(db, company_id, body.csv_text)


@router.post("/{company_id}/ai-suggest")
def post_ai_suggest(company_id: int, body: AiSuggestBody, db: Session = Depends(get_db)):
    return ai_suggest_mappings(db, company_id, body.hint, body.only_unmapped)


@router.post("/{company_id}/ai-normalize-accounts")
def post_ai_normalize_accounts(company_id: int, body: AiNormalizeBody, db: Session = Depends(get_db)):
    """Use the LLM to parse a free-form template into normalized accounts (preview-only)."""
    return ai_normalize_accounts(db, company_id, body.raw_text, body.hint)


@router.post("/{company_id}/bulk-bindings")
def post_bulk_bindings(company_id: int, body: BulkBindingsBody, db: Session = Depends(get_db)):
    """Apply a list of category-binding suggestions atomically."""
    from packages.core.platform.models_accounting_category import AccountingCategory  # local import
    applied = 0
    for b in body.bindings:
        cat_id = b.get("category_id")
        if cat_id is None:
            continue
        cat = (
            db.query(AccountingCategory)
            .filter(
                AccountingCategory.id == cat_id,
                AccountingCategory.company_id == company_id,
            )
            .first()
        )
        if cat is None:
            continue
        if "expense_account_id"      in b: cat.expense_account_id      = b["expense_account_id"]
        if "tax_rate_id"             in b: cat.tax_rate_id             = b["tax_rate_id"]
        if "counterparty_account_id" in b: cat.counterparty_account_id = b["counterparty_account_id"]
        applied += 1
    db.commit()
    return {"applied": applied}


# ── Phase D: bulk simulator + exporters ──────────────────────────────────────

@router.get("/{company_id}/bulk-simulate")
def get_bulk_simulate(company_id: int, limit: int = 50, db: Session = Depends(get_db)):
    """Run simulate_poliza over the last *limit* expenses for the company."""
    return bulk_simulate(db, company_id, limit=limit)


def _filename(prefix: str, ext: str) -> str:
    from datetime import datetime as _dt
    return f"{prefix}_{_dt.utcnow().strftime('%Y%m%d')}.{ext}"


@router.get("/{company_id}/export/coi")
def export_coi(company_id: int, limit: int = 200, db: Session = Depends(get_db)):
    bulk = bulk_simulate(db, company_id, limit=limit)
    return Response(
        content=render_coi(bulk),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{_filename("coi", "txt")}"'},
    )


@router.get("/{company_id}/export/contpaqi")
def export_contpaqi(company_id: int, limit: int = 200, db: Session = Depends(get_db)):
    bulk = bulk_simulate(db, company_id, limit=limit)
    return Response(
        content=render_contpaqi(bulk),
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{_filename("contpaqi", "xml")}"'},
    )


@router.get("/{company_id}/export/sat-polizas")
def export_sat(company_id: int, limit: int = 200, rfc: str = "XAXX010101000",
               db: Session = Depends(get_db)):
    bulk = bulk_simulate(db, company_id, limit=limit)
    return Response(
        content=render_sat_polizas(bulk, rfc=rfc),
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{_filename("sat_polizas", "xml")}"'},
    )


class CustomExportBody(BaseModel):
    line_template: str
    header: str = ""
    footer: str = ""
    one_line_per: str = "movement"  # "movement" | "expense"
    limit: int = 200
    filename: str = "export"
    extension: str = "csv"
    download: bool = False  # True -> file download, False -> JSON preview


@router.get("/export/custom-placeholders")
def get_custom_placeholders():
    """Catalog of placeholders the UI can show as chips."""
    return list_custom_placeholders()


@router.post("/{company_id}/export/custom")
def export_custom(company_id: int, body: CustomExportBody, db: Session = Depends(get_db)):
    """Render bulk pólizas with a user-defined template.

    download=False (default): JSON {output, line_count, byte_count} for live preview.
    download=True: text/plain attachment using body.filename + body.extension.
    """
    bulk = bulk_simulate(db, company_id, limit=max(1, min(body.limit, 500)))
    text = render_custom(
        bulk,
        line_template=body.line_template,
        header=body.header,
        footer=body.footer,
        one_line_per=body.one_line_per,
    )
    if body.download:
        ext = (body.extension or "txt").lstrip(".") or "txt"
        safe_name = (body.filename or "export").replace('"', "").strip() or "export"
        full = f"{safe_name}_{_filename('', ext).lstrip('_')}"
        return Response(
            content=text,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{full}"'},
        )
    lines = text.splitlines()
    preview = "\n".join(lines[:30])
    return {
        "line_count":    len(lines),
        "byte_count":    len(text.encode("utf-8")),
        "preview":       preview,
        "truncated":     len(lines) > 30,
        "row_count":     bulk.get("count", 0),
        "balanced":      bulk.get("balanced", 0),
        "total_debit":   bulk.get("total_debit"),
        "total_credit":  bulk.get("total_credit"),
    }
