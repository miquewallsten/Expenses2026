"""coa_import_service.py — bulk CSV import + AI-assisted mapping suggestions.

Two entry points:

  * `import_accounts_csv(db, company_id, csv_text)`
        Parse a pasted/uploaded CSV of GL accounts and upsert them into
        `accounting_accounts`. Tolerates Excel-style headers in either
        Spanish or English ("Código"/"Code", "Nombre"/"Name", "Clase"/"Class",
        "SAT", "Split"). Required columns: code, name. Returns a summary
        dict.

  * `ai_suggest_mappings(db, company_id, hint, categories)`
        Ask the local Ollama model to propose `expense_account_id`,
        `tax_rate_id`, `counterparty_account_id` for each unmapped category.
        Returns a list of suggestions the UI shows in a confirm-then-apply
        flow (we never auto-write — the admin must accept).
"""

from __future__ import annotations

import csv
import io
import json
import re
from typing import Any

from sqlalchemy.orm import Session

from apps.api.ai.ollama_client import chat_with_ollama
from packages.core.platform.models_accounting_account  import AccountingAccount
from packages.core.platform.models_accounting_category import AccountingCategory
from packages.core.platform.models_tax_rate            import TaxRate
from packages.modules.accounting.service.chart_of_accounts_service import upsert_account


# ── CSV import ────────────────────────────────────────────────────────────────

# Header aliases (lower-cased, accent-stripped on lookup).
_HEADER_MAP = {
    "code": "code", "codigo": "code", "código": "code", "cuenta": "code",
    "name": "name", "nombre": "name", "descripcion": "name", "descripción": "name",
    "class": "account_class", "clase": "account_class", "tipo": "account_class",
    "sat":   "sat_group_code", "sat_code": "sat_group_code", "agrupador": "sat_group_code",
    "split": "split_by", "split_by": "split_by", "dimension": "split_by",
    "parent": "parent_code", "padre": "parent_code", "parent_code": "parent_code",
    "postable": "is_postable", "imputable": "is_postable",
}

_CLASS_MAP = {
    "asset": "asset", "activo": "asset",
    "liability": "liability", "pasivo": "liability",
    "equity": "equity", "capital": "equity",
    "income": "income", "ingreso": "income", "ingresos": "income",
    "expense": "expense", "gasto": "expense", "gastos": "expense",
    "cost": "expense", "costo": "expense",
}

_SPLIT_MAP = {
    "": "none", "none": "none", "ninguno": "none",
    "cost_center": "cost_center", "centro de costos": "cost_center", "centro_costos": "cost_center",
    "project": "project", "proyecto": "project",
    "client": "client", "cliente": "client",
}


def _norm(s: str) -> str:
    s = s.strip().lower()
    return (s.replace("á", "a").replace("é", "e").replace("í", "i")
             .replace("ó", "o").replace("ú", "u"))


def import_accounts_csv(db: Session, company_id: int, csv_text: str) -> dict[str, Any]:
    """Parse *csv_text* and bulk-upsert GL accounts.

    Returns {created_or_updated, errors[], warnings[]}.
    """
    if not csv_text or not csv_text.strip():
        return {"created_or_updated": 0, "errors": ["CSV vacío"], "warnings": []}

    # csv.Sniffer is finicky; just try comma then semicolon then tab.
    delim = ","
    sample = csv_text[:2048]
    if sample.count(";") > sample.count(",") and sample.count(";") > sample.count("\t"):
        delim = ";"
    elif sample.count("\t") > sample.count(","):
        delim = "\t"

    reader = csv.DictReader(io.StringIO(csv_text), delimiter=delim)
    if not reader.fieldnames:
        return {"created_or_updated": 0, "errors": ["No se encontró encabezado en el CSV"], "warnings": []}

    # Build header → canonical-field map.
    canonical: dict[str, str] = {}
    for raw in reader.fieldnames:
        key = _HEADER_MAP.get(_norm(raw or ""))
        if key:
            canonical[raw] = key
    if "code" not in canonical.values() or "name" not in canonical.values():
        return {
            "created_or_updated": 0,
            "errors": ["El CSV debe incluir columnas 'code' (o 'Código') y 'name' (o 'Nombre')."],
            "warnings": [],
        }

    errors: list[str]   = []
    warnings: list[str] = []
    count = 0

    for idx, row in enumerate(reader, start=2):  # row 1 = header
        clean: dict[str, Any] = {"account_class": "expense", "split_by": "none", "is_postable": True}
        for raw_col, val in row.items():
            field = canonical.get(raw_col)
            if not field or val is None:
                continue
            v = str(val).strip()
            if field == "account_class":
                clean[field] = _CLASS_MAP.get(_norm(v), "expense")
            elif field == "split_by":
                clean[field] = _SPLIT_MAP.get(_norm(v), "none")
            elif field == "is_postable":
                clean[field] = _norm(v) not in ("false", "no", "0", "n")
            else:
                clean[field] = v

        if not clean.get("code") or not clean.get("name"):
            errors.append(f"Fila {idx}: code y name son obligatorios")
            continue

        try:
            upsert_account(db, company_id, {
                "code":           str(clean["code"]).strip(),
                "name":           str(clean["name"]).strip(),
                "sat_group_code": clean.get("sat_group_code"),
                "account_class":  clean["account_class"],
                "is_postable":    clean["is_postable"],
                "split_by":       clean["split_by"],
                "sort_order":     idx,
            })
            count += 1
        except Exception as exc:
            errors.append(f"Fila {idx} ({clean.get('code')}): {exc}")

    if count == 0 and not errors:
        warnings.append("No se procesó ninguna fila — el CSV está vacío después del encabezado.")

    return {"created_or_updated": count, "errors": errors, "warnings": warnings}


# ── AI mapping suggestions ────────────────────────────────────────────────────

_SUGGEST_PROMPT = """Eres un asistente contable mexicano. Tu tarea es proponer
qué cuenta del catálogo (CoA), qué tasa de IVA y qué cuenta de contrapartida
debe usar cada categoría de gasto.

Responde EXCLUSIVAMENTE con JSON válido, una lista de objetos, uno por
categoría. Esquema:
[
  {"category_code":"TRAVEL","expense_account_id":12,"tax_rate_id":3,"counterparty_account_id":18,"reasoning":"…"},
  ...
]

Si no estás seguro de un campo, devuélvelo como null. NO inventes IDs que no
estén en las listas que te paso.
"""


def ai_suggest_mappings(
    db: Session,
    company_id: int,
    hint: str = "",
    only_unmapped: bool = True,
) -> dict[str, Any]:
    """Ask the LLM to propose CoA + IVA mappings for each category."""
    accounts = (
        db.query(AccountingAccount)
        .filter(AccountingAccount.company_id == company_id, AccountingAccount.is_active.is_(True))
        .order_by(AccountingAccount.code)
        .all()
    )
    rates = (
        db.query(TaxRate)
        .filter(TaxRate.company_id == company_id, TaxRate.is_active.is_(True))
        .all()
    )
    cats_q = db.query(AccountingCategory).filter(
        AccountingCategory.company_id == company_id,
        AccountingCategory.is_active.is_(True),
    )
    if only_unmapped:
        cats_q = cats_q.filter(AccountingCategory.expense_account_id.is_(None))
    cats = cats_q.order_by(AccountingCategory.code).all()

    if not cats:
        return {"ok": True, "suggestions": [], "note": "No hay categorías sin mapear."}
    if not accounts or not rates:
        return {"ok": False, "suggestions": [],
                "note": "Falta catálogo de cuentas o tasas de IVA. Aplica Plan Básico primero."}

    # Compact context for the LLM (id + code + name only).
    ctx = {
        "accounts":   [{"id": a.id, "code": a.code, "name": a.name, "class": a.account_class} for a in accounts],
        "tax_rates":  [{"id": r.id, "name": r.name, "rate": float(r.rate), "behavior": r.behavior} for r in rates],
        "categories": [{"code": c.code, "name": c.name} for c in cats],
        "hint":       hint or "",
    }

    user_msg = "Datos:\n" + json.dumps(ctx, ensure_ascii=False) + "\n\nDevuelve solo el JSON."
    res = chat_with_ollama(_SUGGEST_PROMPT, user_msg, temperature=0.2)

    if not res.get("ok"):
        return {"ok": False, "suggestions": [], "note": res.get("error") or "Modelo IA no disponible"}

    raw = res.get("content") or ""
    # Strip code fences if present.
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.MULTILINE)
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            raise ValueError("Expected list")
    except Exception:
        return {"ok": False, "suggestions": [], "note": "El modelo no devolvió JSON válido.",
                "raw": raw[:500]}

    # Sanity-filter — only keep IDs that actually exist for this company.
    valid_acct_ids = {a.id for a in accounts}
    valid_rate_ids = {r.id for r in rates}
    cat_lookup     = {c.code: c.id for c in cats}

    suggestions: list[dict[str, Any]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        code = item.get("category_code")
        cat_id = cat_lookup.get(code)
        if cat_id is None:
            continue
        eid = item.get("expense_account_id")
        rid = item.get("tax_rate_id")
        cid = item.get("counterparty_account_id")
        suggestions.append({
            "category_id":             cat_id,
            "category_code":           code,
            "expense_account_id":      eid if eid in valid_acct_ids else None,
            "tax_rate_id":             rid if rid in valid_rate_ids else None,
            "counterparty_account_id": cid if cid in valid_acct_ids else None,
            "reasoning":               (item.get("reasoning") or "")[:240],
        })

    return {"ok": True, "model": res.get("model"), "suggestions": suggestions}


# ── Template normalization (Copilot) ─────────────────────────────────────────

_NORMALIZE_PROMPT = """Eres un asistente contable mexicano experto en catálogos
de cuentas (CoA). Recibirás texto crudo pegado por el usuario: puede venir de
Excel, PDF, ERP exportado, lista de WhatsApp, etc. Las columnas, encabezados
e idioma pueden variar.

Tu tarea: detectar las cuentas contables y devolverlas normalizadas a este
esquema canónico. Responde EXCLUSIVAMENTE con JSON válido, sin explicación
ni markdown:

{
  "accounts": [
    {
      "code": "601-30",
      "name": "Renta de oficina",
      "account_class": "expense",   // expense | asset | liability | income | equity
      "sat_group_code": "601.30",   // código agrupador SAT si lo identificas, si no null
      "split_by": "none"            // none | cost_center | project | client
    }
  ],
  "notes": "breve resumen de lo que detectaste o problemas"
}

Reglas:
- Conserva el código tal como aparece (no inventes ni renumeres).
- Si una fila no parece ser una cuenta (encabezados, totales, separadores), omítela.
- Clasifica por convención mexicana: 1xx activo, 2xx pasivo, 3xx capital, 4xx ingreso, 5xx costo (expense), 6xx gasto (expense).
- Si no estás seguro de un campo opcional, devuélvelo como null o el valor por defecto.
- Devuelve máximo 200 cuentas por lote.
"""


def ai_normalize_accounts(
    db: Session,
    company_id: int,
    raw_text: str,
    hint: str = "",
) -> dict[str, Any]:
    """Use the LLM to convert messy/free-form account lists into our schema.

    Returns {ok, accounts:[{code,name,account_class,sat_group_code,split_by}], note}.
    Does NOT write to the DB — caller previews then commits via import_accounts_csv.
    """
    if not raw_text or not raw_text.strip():
        return {"ok": False, "accounts": [], "note": "Sin contenido para analizar."}

    # Cap input size to keep LLM happy.
    snippet = raw_text.strip()[:24000]
    user_msg = ""
    if hint.strip():
        user_msg += f"Contexto del cliente: {hint.strip()}\n\n"
    user_msg += "Texto del template:\n" + snippet + "\n\nDevuelve solo el JSON."

    res = chat_with_ollama(_NORMALIZE_PROMPT, user_msg, temperature=0.1)
    if not res.get("ok"):
        return {"ok": False, "accounts": [], "note": res.get("error") or "Modelo IA no disponible"}

    raw = (res.get("content") or "").strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE)
    try:
        parsed = json.loads(raw)
    except Exception:
        return {"ok": False, "accounts": [], "note": "El modelo no devolvió JSON válido.",
                "raw": raw[:500]}

    items = parsed.get("accounts") if isinstance(parsed, dict) else parsed
    if not isinstance(items, list):
        return {"ok": False, "accounts": [], "note": "JSON sin lista de cuentas."}

    valid_classes = {"expense", "asset", "liability", "income", "equity"}
    valid_splits  = {"none", "cost_center", "project", "client"}
    out: list[dict[str, Any]] = []
    seen_codes: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        code = str(item.get("code") or "").strip()
        name = str(item.get("name") or "").strip()
        if not code or not name or code in seen_codes:
            continue
        seen_codes.add(code)
        cls = str(item.get("account_class") or "expense").strip().lower()
        if cls not in valid_classes:
            cls = _CLASS_MAP.get(_norm(cls), "expense")
        split = str(item.get("split_by") or "none").strip().lower()
        if split not in valid_splits:
            split = _SPLIT_MAP.get(_norm(split), "none")
        sat = item.get("sat_group_code")
        sat = str(sat).strip() if sat else None
        out.append({
            "code":           code,
            "name":           name[:200],
            "account_class":  cls,
            "sat_group_code": sat or None,
            "split_by":       split,
        })
        if len(out) >= 200:
            break

    note = ""
    if isinstance(parsed, dict):
        note = str(parsed.get("notes") or "")[:240]
    return {"ok": True, "model": res.get("model"), "accounts": out, "note": note}
