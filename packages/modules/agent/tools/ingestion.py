"""Ingestion tools — parse uploaded CSV/Excel/PDF samples into receipt previews.

Flow (two-phase):
  1. Admin uploads a file via POST /agent/upload → receives ``file_id``.
  2. LLM (or admin) calls ``ingest_*`` with that ``file_id``.
  3. The tool reads the file from ``AgentUpload.storage_path``, infers a
     column mapping, builds a list of row proposals, and creates a receipt
     whose ``args`` carry the structured rows.
  4. Admin reviews in the UI, then calls ``/agent/confirm`` → the applier
     bulk-inserts any rows that don't already exist.

Column-name inference is purely deterministic (normalize to lowercase,
strip non-alphanumerics, match against per-field synonym sets). No LLM
involved — keeps the preview reproducible and testable.

Supported formats:
  .csv, .tsv  — pandas.read_csv (auto-delimited for .tsv)
  .xlsx, .xls — pandas.read_excel (first sheet)
  .pdf        — pdfplumber (first-page tables if any; else first-page text lines)
"""

from __future__ import annotations

import io
import json
import os
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from packages.core.platform.models_accounting_category import AccountingCategory
from packages.core.platform.models_client import Client
from packages.core.platform.models_cost_center import CostCenter
from packages.core.platform.models_project import Project
from packages.core.platform.models_user import User

from ..core.appliers import register_applier
from ..core.context import AgentContext
from ..core.receipts import create_receipt
from ..core.registry import REGISTRY, ToolResult, ToolSpec
from ..models import AgentUpload


# ── Upload resolution ─────────────────────────────────────────────────────

_MAX_ROWS = 2000


class FileIdArg(BaseModel):
    model_config = ConfigDict(extra="forbid")
    file_id: str = Field(..., min_length=1, max_length=64)


def _resolve_upload(ctx: AgentContext, file_id: str) -> AgentUpload | ToolResult:
    row = (
        ctx.db.query(AgentUpload)
        .filter(AgentUpload.file_id == file_id, AgentUpload.company_id == ctx.company_id)
        .one_or_none()
    )
    if row is None:
        return ToolResult(ok=False, summary="archivo no encontrado", error="file_not_found")
    if not os.path.exists(row.storage_path):
        return ToolResult(ok=False, summary="archivo no disponible en almacenamiento", error="file_missing")
    return row


# ── Parsing ────────────────────────────────────────────────────────────────

def _read_table(upload: AgentUpload) -> list[dict[str, Any]]:
    """Return a list of dict rows parsed from the upload.

    Raises ``ValueError`` on unsupported formats / parse failure.
    """
    import pandas as pd  # local import so missing dep surfaces clearly

    path = upload.storage_path
    ext = os.path.splitext(upload.filename.lower())[1]

    if ext in (".csv",):
        df = pd.read_csv(path, dtype=str, keep_default_na=False)
    elif ext in (".tsv",):
        df = pd.read_csv(path, sep="\t", dtype=str, keep_default_na=False)
    elif ext in (".xlsx", ".xls"):
        df = pd.read_excel(path, dtype=str, engine="openpyxl" if ext == ".xlsx" else None)
        df = df.fillna("")
    elif ext == ".pdf":
        rows = _read_pdf_rows(path)
        return rows[:_MAX_ROWS]
    else:
        raise ValueError(f"unsupported file extension: {ext}")

    df = df.head(_MAX_ROWS)
    return [{str(k): ("" if v is None else str(v).strip()) for k, v in row.items()} for row in df.to_dict(orient="records")]


def _read_pdf_rows(path: str) -> list[dict[str, Any]]:
    """Extract tables from a PDF via pdfplumber. Falls back to text lines."""
    import pdfplumber

    with pdfplumber.open(path) as pdf:
        if not pdf.pages:
            return []
        page = pdf.pages[0]
        tables = page.extract_tables() or []
        if tables:
            table = tables[0]
            if len(table) < 2:
                return []
            headers = [str(h or "").strip() for h in table[0]]
            out = []
            for row in table[1:]:
                out.append({headers[i]: (str(row[i] or "").strip() if i < len(row) else "") for i in range(len(headers))})
            return out
        # text-line fallback
        text = page.extract_text() or ""
        return [{"line": ln.strip()} for ln in text.splitlines() if ln.strip()]


# ── Column inference ──────────────────────────────────────────────────────

def _normalize(h: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (h or "").lower())


def _match_column(headers: list[str], synonyms: list[str]) -> str | None:
    syn_norm = [_normalize(s) for s in synonyms]
    for h in headers:
        if _normalize(h) in syn_norm:
            return h
    return None


_ACCT_SYNONYMS = {
    "code":                   ["code", "clave", "categoria", "category", "codigo"],
    "name":                   ["name", "nombre", "descripcion", "description", "label"],
    "expense_account_code":   ["expenseaccount", "expensegl", "gl", "accountcode", "cuentagasto", "cuenta"],
    "liability_account_code": ["liabilityaccount", "ivapayable", "cuentaiva", "ivagl"],
    "tax_behavior":           ["taxbehavior", "iva", "ivabehavior", "tratamientoiva", "taxtreatment"],
    "requires_project":       ["requiresproject", "requireproject", "requiereproyecto", "needsproject"],
}

_USER_SYNONYMS = {
    "email":     ["email", "correo", "mail", "emailaddress"],
    "full_name": ["fullname", "name", "nombre", "nombrecompleto"],
    "role":      ["role", "rol", "puesto"],
    "department": ["department", "departamento", "area"],
    "job_title": ["jobtitle", "puesto", "title", "cargo"],
    "phone":     ["phone", "telefono", "celular", "mobile"],
}

_ORG_SYNONYMS = {
    "code":   ["code", "codigo", "clave", "id"],
    "name":   ["name", "nombre", "descripcion", "description"],
    "status": ["status", "estado", "activo", "active"],
}


def _map_row(row: dict[str, Any], mapping: dict[str, str]) -> dict[str, Any]:
    return {field: (row.get(src, "") if src else "") for field, src in mapping.items()}


def _coerce_bool(v: Any) -> bool:
    return str(v or "").strip().lower() in ("1", "true", "yes", "si", "sí", "x")


def _coerce_tax_behavior(v: Any) -> str:
    s = str(v or "").strip().lower()
    if s in ("creditable", "acreditable"): return "creditable"
    if s in ("non_creditable", "noncreditable", "no_acreditable", "noacreditable"): return "non_creditable"
    return "none"


# ── Accounting catalog ingestion ──────────────────────────────────────────

def _handle_ingest_accounting_catalog(ctx: AgentContext, args: FileIdArg) -> ToolResult:
    up = _resolve_upload(ctx, args.file_id)
    if isinstance(up, ToolResult):
        return up
    try:
        rows = _read_table(up)
    except Exception as e:
        return ToolResult(ok=False, summary=f"no se pudo leer el archivo: {e}", error="parse_error")
    if not rows:
        return ToolResult(ok=False, summary="archivo vacío", error="empty_file")

    headers = list(rows[0].keys())
    mapping = {field: _match_column(headers, syn) for field, syn in _ACCT_SYNONYMS.items()}
    if not mapping["code"] or not mapping["name"]:
        return ToolResult(
            ok=False,
            summary="no se pudieron detectar columnas obligatorias (code, name)",
            error="missing_required_columns",
            data={"detected_headers": headers, "mapping": mapping},
        )

    existing = {
        r.code for r in ctx.db.query(AccountingCategory.code)
        .filter(AccountingCategory.company_id == ctx.company_id).all()
    }

    proposed: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in rows:
        mapped = _map_row(raw, mapping)
        code = (mapped.get("code") or "").strip()
        name = (mapped.get("name") or "").strip()
        if not code or not name:
            continue
        if code in existing or code in seen:
            skipped.append({"code": code, "reason": "already_exists"})
            continue
        seen.add(code)
        proposed.append({
            "code": code[:50],
            "name": name[:255],
            "expense_account_code":   (mapped.get("expense_account_code")   or None) or None,
            "liability_account_code": (mapped.get("liability_account_code") or None) or None,
            "tax_behavior":           _coerce_tax_behavior(mapped.get("tax_behavior")),
            "requires_project":       _coerce_bool(mapped.get("requires_project")),
        })

    if not proposed:
        return ToolResult(ok=True, summary="no hay filas nuevas para crear",
                          data={"mapping": mapping, "skipped": skipped, "headers": headers})

    preview = {
        "action":   "ingest_accounting_catalog",
        "file_id":  args.file_id,
        "filename": up.filename,
        "mapping":  mapping,
        "headers":  headers,
        "counts":   {"proposed": len(proposed), "skipped": len(skipped)},
        "rows":     proposed[:20],      # UI preview cap; applier uses the full list
        "skipped":  skipped[:20],
    }
    receipt = create_receipt(
        db=ctx.db,
        company_id=ctx.company_id,
        session_id=ctx.session_id,
        tool_name="ingest_accounting_catalog",
        args={"file_id": args.file_id, "rows": proposed},
        preview=preview,
    )
    return ToolResult(
        ok=True,
        summary=f"{len(proposed)} categorías listas para crear — requiere confirmación",
        data={"preview": preview},
        receipt_id=receipt.receipt_id,
    )


def _apply_ingest_accounting_catalog(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    rows = args.get("rows") or []
    existing = {
        r.code for r in ctx.db.query(AccountingCategory.code)
        .filter(AccountingCategory.company_id == ctx.company_id).all()
    }
    created = 0
    for r in rows:
        code = str(r.get("code") or "").strip()
        if not code or code in existing:
            continue
        ctx.db.add(AccountingCategory(
            company_id=ctx.company_id,
            code=code,
            name=str(r.get("name") or code),
            expense_account_code=r.get("expense_account_code"),
            liability_account_code=r.get("liability_account_code"),
            tax_behavior=str(r.get("tax_behavior") or "none"),
            requires_project=bool(r.get("requires_project") or False),
        ))
        existing.add(code)
        created += 1
    ctx.db.commit()
    return {"created": created, "total_proposed": len(rows)}


REGISTRY.register(ToolSpec(
    name="ingest_accounting_catalog",
    description=(
        "Analiza un archivo CSV/Excel/PDF subido previamente y propone crear "
        "categorías contables (code, name, expense_account_code, tax_behavior…). "
        "Usa el file_id devuelto por /agent/upload. Requiere confirmación."
    ),
    category="ingestion",
    input_schema=FileIdArg,
    handler=_handle_ingest_accounting_catalog,
    personas=frozenset({"admin"}),
    destructive=True,
    requires_confirmation=True,
))
register_applier("ingest_accounting_catalog", _apply_ingest_accounting_catalog)


# ── User roster ingestion ─────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _handle_ingest_user_roster(ctx: AgentContext, args: FileIdArg) -> ToolResult:
    up = _resolve_upload(ctx, args.file_id)
    if isinstance(up, ToolResult):
        return up
    try:
        rows = _read_table(up)
    except Exception as e:
        return ToolResult(ok=False, summary=f"no se pudo leer el archivo: {e}", error="parse_error")
    if not rows:
        return ToolResult(ok=False, summary="archivo vacío", error="empty_file")

    headers = list(rows[0].keys())
    mapping = {field: _match_column(headers, syn) for field, syn in _USER_SYNONYMS.items()}
    if not mapping["email"] or not mapping["full_name"]:
        return ToolResult(
            ok=False,
            summary="no se pudieron detectar columnas obligatorias (email, full_name)",
            error="missing_required_columns",
            data={"detected_headers": headers, "mapping": mapping},
        )

    # Existing emails in THIS company only (User.email is unique globally —
    # cross-company duplicates will be caught again by the applier).
    existing = {
        e for (e,) in ctx.db.query(User.email).filter(User.company_id == ctx.company_id).all()
    }

    proposed: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in rows:
        mapped = _map_row(raw, mapping)
        email = (mapped.get("email") or "").strip().lower()
        full_name = (mapped.get("full_name") or "").strip()
        if not email or not full_name:
            continue
        if not _EMAIL_RE.match(email):
            skipped.append({"email": email, "reason": "invalid_email"})
            continue
        if email in existing or email in seen:
            skipped.append({"email": email, "reason": "already_exists"})
            continue
        seen.add(email)
        role = (mapped.get("role") or "employee").strip().lower() or "employee"
        proposed.append({
            "email":      email[:255],
            "full_name":  full_name[:255],
            "role":       role[:50],
            "department": (mapped.get("department") or "").strip()[:100] or None,
            "job_title":  (mapped.get("job_title")  or "").strip()[:150] or None,
            "phone":      (mapped.get("phone")      or "").strip()[:50]  or None,
        })

    if not proposed:
        return ToolResult(ok=True, summary="no hay usuarios nuevos para crear",
                          data={"mapping": mapping, "skipped": skipped, "headers": headers})

    preview = {
        "action":   "ingest_user_roster",
        "file_id":  args.file_id,
        "filename": up.filename,
        "mapping":  mapping,
        "headers":  headers,
        "counts":   {"proposed": len(proposed), "skipped": len(skipped)},
        "rows":     proposed[:20],
        "skipped":  skipped[:20],
    }
    receipt = create_receipt(
        db=ctx.db,
        company_id=ctx.company_id,
        session_id=ctx.session_id,
        tool_name="ingest_user_roster",
        args={"file_id": args.file_id, "rows": proposed},
        preview=preview,
    )
    return ToolResult(
        ok=True,
        summary=f"{len(proposed)} usuarios listos para crear — requiere confirmación",
        data={"preview": preview},
        receipt_id=receipt.receipt_id,
    )


def _apply_ingest_user_roster(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    rows = args.get("rows") or []
    # Re-check against global uniqueness at apply time.
    existing_global = {e for (e,) in ctx.db.query(User.email).all()}
    created, skipped = 0, 0
    for r in rows:
        email = str(r.get("email") or "").strip().lower()
        if not email or email in existing_global:
            skipped += 1
            continue
        ctx.db.add(User(
            company_id=ctx.company_id,
            email=email,
            full_name=str(r.get("full_name") or email),
            role=str(r.get("role") or "employee"),
            department=r.get("department"),
            job_title=r.get("job_title"),
            phone=r.get("phone"),
        ))
        existing_global.add(email)
        created += 1
    ctx.db.commit()
    return {"created": created, "skipped": skipped, "total_proposed": len(rows)}


REGISTRY.register(ToolSpec(
    name="ingest_user_roster",
    description=(
        "Analiza un archivo CSV/Excel/PDF con empleados y propone crear usuarios "
        "(email, full_name, role, department, job_title). Requiere confirmación."
    ),
    category="ingestion",
    input_schema=FileIdArg,
    handler=_handle_ingest_user_roster,
    personas=frozenset({"admin"}),
    destructive=True,
    requires_confirmation=True,
))
register_applier("ingest_user_roster", _apply_ingest_user_roster)


# ── Org entity ingestion (cost_center | client | project) ─────────────────

_ORG_MODELS = {"cost_center": CostCenter, "client": Client, "project": Project}


class IngestOrgArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    file_id: str = Field(..., min_length=1, max_length=64)
    kind:    str = Field(..., pattern=r"^(cost_center|client|project)$")


def _handle_ingest_org_entities(ctx: AgentContext, args: IngestOrgArgs) -> ToolResult:
    up = _resolve_upload(ctx, args.file_id)
    if isinstance(up, ToolResult):
        return up
    try:
        rows = _read_table(up)
    except Exception as e:
        return ToolResult(ok=False, summary=f"no se pudo leer el archivo: {e}", error="parse_error")
    if not rows:
        return ToolResult(ok=False, summary="archivo vacío", error="empty_file")

    headers = list(rows[0].keys())
    mapping = {field: _match_column(headers, syn) for field, syn in _ORG_SYNONYMS.items()}
    if not mapping["code"] or not mapping["name"]:
        return ToolResult(
            ok=False,
            summary="no se pudieron detectar columnas obligatorias (code, name)",
            error="missing_required_columns",
            data={"detected_headers": headers, "mapping": mapping},
        )

    model = _ORG_MODELS[args.kind]
    existing = {
        c for (c,) in ctx.db.query(model.code).filter(model.company_id == ctx.company_id).all()
    }

    proposed: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in rows:
        mapped = _map_row(raw, mapping)
        code = (mapped.get("code") or "").strip()
        name = (mapped.get("name") or "").strip()
        if not code or not name:
            continue
        if code in existing or code in seen:
            skipped.append({"code": code, "reason": "already_exists"})
            continue
        status = (mapped.get("status") or "active").strip().lower() or "active"
        if status not in ("active", "inactive"):
            status = "active"
        seen.add(code)
        proposed.append({"code": code[:100], "name": name[:255], "status": status[:50]})

    if not proposed:
        return ToolResult(ok=True, summary="no hay registros nuevos para crear",
                          data={"kind": args.kind, "mapping": mapping, "skipped": skipped, "headers": headers})

    preview = {
        "action":   "ingest_org_entities",
        "kind":     args.kind,
        "file_id":  args.file_id,
        "filename": up.filename,
        "mapping":  mapping,
        "headers":  headers,
        "counts":   {"proposed": len(proposed), "skipped": len(skipped)},
        "rows":     proposed[:20],
        "skipped":  skipped[:20],
    }
    receipt = create_receipt(
        db=ctx.db,
        company_id=ctx.company_id,
        session_id=ctx.session_id,
        tool_name="ingest_org_entities",
        args={"file_id": args.file_id, "kind": args.kind, "rows": proposed},
        preview=preview,
    )
    return ToolResult(
        ok=True,
        summary=f"{len(proposed)} {args.kind}s listos para crear — requiere confirmación",
        data={"preview": preview},
        receipt_id=receipt.receipt_id,
    )


def _apply_ingest_org_entities(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    kind = str(args["kind"])
    model = _ORG_MODELS[kind]
    rows = args.get("rows") or []
    existing = {
        c for (c,) in ctx.db.query(model.code).filter(model.company_id == ctx.company_id).all()
    }
    created = 0
    for r in rows:
        code = str(r.get("code") or "").strip()
        if not code or code in existing:
            continue
        ctx.db.add(model(
            company_id=ctx.company_id,
            code=code,
            name=str(r.get("name") or code),
            status=str(r.get("status") or "active"),
        ))
        existing.add(code)
        created += 1
    ctx.db.commit()
    return {"kind": kind, "created": created, "total_proposed": len(rows)}


REGISTRY.register(ToolSpec(
    name="ingest_org_entities",
    description=(
        "Analiza un archivo con una lista de cost_center | client | project "
        "(code, name, status) y propone crearlos. Requiere confirmación."
    ),
    category="ingestion",
    input_schema=IngestOrgArgs,
    handler=_handle_ingest_org_entities,
    personas=frozenset({"admin"}),
    destructive=True,
    requires_confirmation=True,
))
register_applier("ingest_org_entities", _apply_ingest_org_entities)


# Silence unused-import warnings on io/json (kept for future PDF table flows).
_ = (io, json)
