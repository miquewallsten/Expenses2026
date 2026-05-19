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


def _read_xml(path: str) -> list[dict[str, Any]]:
    """Parse an XML file (e.g., CFDI) into structured rows."""
    import xml.etree.ElementTree as ET
    try:
        tree = ET.parse(path)
        root = tree.getroot()
        # Remove namespace prefixes for easier access
        ns = {"cfdi": "http://www.sat.gob.mx/cfd/4", "tfd": "http://www.sat.gob.mx/TimbreFiscalDigital"}
        # Try CFDI structure first
        cfdi = root.find(".//cfdi:Comprobante", ns) or root if "Comprobante" in root.tag else root
        rows = []
        # Extract key attributes from the root element
        for key, value in root.attrib.items():
            tag = key.split("}")[-1] if "}" in key else key
            rows.append({"campo": tag, "valor": value})
        # Extract child elements
        for child in root:
            tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if child.attrib:
                for k, v in child.attrib.items():
                    ktag = k.split("}")[-1] if "}" in k else k
                    rows.append({"campo": f"{tag}.{ktag}", "valor": v})
            elif child.text and child.text.strip():
                rows.append({"campo": tag, "valor": child.text.strip()})
        return rows if rows else [{"line": line.strip()} for line in ET.tostring(root, encoding="unicode").splitlines() if line.strip()]
    except ET.ParseError as e:
        raise ValueError(f"XML parse error: {e}")


def _read_docx(path: str) -> list[dict[str, Any]]:
    """Extract text from a DOCX file."""
    try:
        from docx import Document
        doc = Document(path)
        rows = []
        for i, para in enumerate(doc.paragraphs):
            if para.text.strip():
                rows.append({"line": para.text.strip(), "paragraph": i + 1})
        # Also extract tables
        for ti, table in enumerate(doc.tables):
            for ri, row in enumerate(table.rows):
                cells = [cell.text.strip() for cell in row.cells]
                rows.append({"table": ti + 1, "row": ri + 1, "cells": " | ".join(cells)})
        return rows
    except ImportError:
        raise ValueError("python-docx not installed — cannot parse DOCX files")


def _read_image_metadata(upload: AgentUpload) -> list[dict[str, Any]]:
    """Extract metadata from an image file for agent analysis.
    The agent can then ask the user what they want to do with the image
    (e.g., use as receipt, reference, or extract data from it)."""
    import os
    size_kb = os.path.getsize(upload.storage_path) / 1024
    return [{
        "type": "image",
        "filename": upload.filename,
        "content_type": upload.content_type,
        "size_kb": round(size_kb, 1),
        "description": f"Imagen cargada: {upload.filename} ({round(size_kb, 1)} KB, {upload.content_type}). El agente debe preguntar al usuario qué quiere hacer con esta imagen.",
    }]


def _read_zip(path: str) -> list[dict[str, Any]]:
    """List contents of a ZIP archive. Individual files can then be uploaded separately."""
    import zipfile
    try:
        with zipfile.ZipFile(path, "r") as zf:
            return [{"name": info.filename, "size_bytes": info.file_size, "compressed_bytes": info.compress_size} for info in zf.infolist() if not info.is_dir()]
    except zipfile.BadZipFile as e:
        raise ValueError(f"Invalid ZIP file: {e}")


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
    personas=frozenset({"accounting", "admin"}),
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
    personas=frozenset({"accounting", "admin"}),
    destructive=True,
    requires_confirmation=True,
))
register_applier("ingest_org_entities", _apply_ingest_org_entities)


# Silence unused-import warnings on io/json (kept for future PDF table flows).
_ = (io, json)



# ── Generic file analysis ───────────────────────────────────────────────────

class _AnalyzeFileArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    file_id: str = Field(..., min_length=1, max_length=64, description="ID del archivo subido")
    analysis_type: str = Field(
        default="auto",
        description="Tipo de análisis: auto, text, data, image, cfdi_xml, template, reference"
    )


def _handle_analyze_file(ctx: AgentContext, args: _AnalyzeFileArgs) -> ToolResult:
    """Analyze any uploaded file and return structured content for the agent.

    The agent can then decide what to do with the content:
    - If it's a chart of accounts → suggest using ingest_accounting_catalog
    - If it's a póliza template → memorize the format
    - If it's an image → describe what it contains and ask the user what they want
    - If it's XML → extract CFDI data
    - If it's a vendor list → offer to create vendors
    - If it's a reference document → save preferences
    """
    up = _resolve_upload(ctx, args.file_id)
    if isinstance(up, ToolResult):
        return up

    ext = os.path.splitext(up.filename.lower())[1]
    result: dict[str, Any] = {
        "file_id": up.file_id,
        "filename": up.filename,
        "content_type": up.content_type,
        "size_bytes": up.size_bytes,
        "analysis_type": args.analysis_type,
    }

    # 1. Image files — return metadata + ask agent to analyze
    if ext in (".jpeg", ".jpg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif"):
        result["type"] = "image"
        result["description"] = (
            f"Imagen cargada: {up.filename} ({up.size_bytes / 1024:.0f} KB). "
            "Analiza la imagen y determina qué contiene (recibo, factura, template, etc.). "
            "Pregunta al usuario qué quiere hacer con ella."
        )
        # Try to extract EXIF data if available
        try:
            from PIL import Image
            img = Image.open(up.storage_path)
            result["image_width"] = img.width
            result["image_height"] = img.height
            result["image_format"] = img.format
            result["image_mode"] = img.mode
        except Exception:
            pass
        return ToolResult(
            ok=True,
            summary=f"Imagen {up.filename} cargada ({up.size_bytes / 1024:.0f} KB)",
            data=result,
        )

    # 2. CFDI XML files — extract fiscal data
    if ext == ".xml":
        try:
            rows = _read_xml(up.storage_path)
            result["type"] = "cfdi_xml"
            result["rows"] = rows[:100]
            result["row_count"] = len(rows)
            result["description"] = (
                f"Archivo CFDI/XML con {len(rows)} campos. "
                "Revisa los datos fiscales (RFC, monto, fecha, UUID) y pregunta si quieres "
                "vincularlo a un gasto existente o crear uno nuevo."
            )
            return ToolResult(
                ok=True,
                summary=f"XML con {len(rows)} campos extraídos",
                data=result,
            )
        except Exception as e:
            return ToolResult(ok=False, summary=f"Error leyendo XML: {e}", error="xml_parse_error")

    # 3. PDF files — extract text and tables
    if ext == ".pdf":
        try:
            rows = _read_pdf_rows(up.storage_path)
            result["type"] = "pdf"
            result["rows"] = rows[:200]
            result["row_count"] = len(rows)
            result["description"] = (
                f"PDF con {len(rows)} filas extraídas. "
                "Analiza el contenido: puede ser un recibo, una póliza contable, "
                "un catálogo de cuentas, una plantilla, etc. "
                "Pregunta al usuario qué quiere hacer con esta información."
            )
            return ToolResult(
                ok=True,
                summary=f"PDF con {len(rows)} filas extraídas",
                data=result,
            )
        except Exception as e:
            return ToolResult(ok=False, summary=f"Error leyendo PDF: {e}", error="pdf_parse_error")

    # 4. Spreadsheet files — extract data
    if ext in (".csv", ".tsv", ".xlsx", ".xls", ".ods"):
        try:
            rows = _read_table(up)
            result["type"] = "spreadsheet"
            result["rows"] = rows[:200]
            result["row_count"] = len(rows)
            headers = list(rows[0].keys()) if rows else []
            result["headers"] = headers
            # Detect content type based on headers
            header_str = " ".join(headers).lower()
            if any(h in header_str for h in ["cuenta", "account", "codigo", "code", "código"]):
                result["detected_type"] = "chart_of_accounts"
                result["suggestion"] = "Parece ser un catálogo de cuentas. ¿Quieres importarlo con ingest_accounting_catalog?"
            elif any(h in header_str for h in ["rfc", "proveedor", "vendor", "nombre"]):
                result["detected_type"] = "vendor_list"
                result["suggestion"] = "Parece ser una lista de proveedores. ¿Quieres crear cada uno como vendor?"
            elif any(h in header_str for h in ["empleado", "email", "usuario", "employee"]):
                result["detected_type"] = "user_roster"
                result["suggestion"] = "Parece ser una lista de usuarios. ¿Quieres importarla con ingest_user_roster?"
            elif any(h in header_str for h in ["centro", "costo", "cliente", "proyecto"]):
                result["detected_type"] = "org_entities"
                result["suggestion"] = "Parece ser una lista de entidades organizacionales. ¿Quieres importarla con ingest_org_entities?"
            else:
                result["detected_type"] = "unknown"
                result["suggestion"] = "Archivo de datos detectado. ¿Qué contiene? ¿Quieres que lo importemos o lo usemos como referencia?"
            return ToolResult(
                ok=True,
                summary=f"{up.filename}: {len(rows)} filas, {len(headers)} columnas",
                data=result,
            )
        except Exception as e:
            return ToolResult(ok=False, summary=f"Error leyendo archivo: {e}", error="parse_error")

    # 5. DOCX files
    if ext in (".docx", ".doc"):
        try:
            rows = _read_docx(up.storage_path)
            result["type"] = "document"
            result["rows"] = rows[:200]
            result["row_count"] = len(rows)
            result["description"] = (
                f"Documento de Word con {len(rows)} párrafos/tablas. "
                "Analiza el contenido y pregunta al usuario qué quiere hacer con esta información."
            )
            return ToolResult(
                ok=True,
                summary=f"DOCX con {len(rows)} elementos extraídos",
                data=result,
            )
        except Exception as e:
            return ToolResult(ok=False, summary=f"Error leyendo DOCX: {e}", error="docx_parse_error")

    # 6. ZIP files
    if ext == ".zip":
        try:
            rows = _read_zip(up.storage_path)
            result["type"] = "zip_archive"
            result["entries"] = rows
            result["entry_count"] = len(rows)
            result["description"] = (
                f"Archivo ZIP con {len(rows)} archivos. Lista los contenidos y pregunta "
                "cuál quieres analizar o si quieres descomprimir todo."
            )
            return ToolResult(
                ok=True,
                summary=f"ZIP con {len(rows)} archivos",
                data=result,
            )
        except Exception as e:
            return ToolResult(ok=False, summary=f"Error leyendo ZIP: {e}", error="zip_parse_error")

    # 7. Plain text
    if ext in (".txt", ".text"):
        try:
            with open(up.storage_path, "r", encoding="utf-8", errors="replace") as fh:
                text = fh.read(50000)  # Max 50KB
            result["type"] = "text"
            result["content"] = text[:10000]  # First 10KB to agent
            result["total_bytes"] = len(text)
            result["description"] = "Archivo de texto. Analiza el contenido y determina qué es."
            return ToolResult(
                ok=True,
                summary=f"Texto: {len(text)} caracteres",
                data=result,
            )
        except Exception as e:
            return ToolResult(ok=False, summary=f"Error leyendo texto: {e}", error="text_parse_error")

    # 8. Unknown file type
    return ToolResult(
        ok=True,
        summary=f"Archivo {up.filename} ({up.content_type}, {up.size_bytes / 1024:.0f} KB). Tipo no reconocido automáticamente.",
        data=result,
    )


REGISTRY.register(ToolSpec(
    name="analyze_file",
    description=(
        "Analiza cualquier archivo subido (imagen, PDF, Excel, XML/CFDI, Word, ZIP, texto). "
        "Detecta el tipo de contenido y extrae datos estructurados. "
        "Para el agente: revisa el resultado y decide qué hacer (importar, memorizar, crear registros, etc.)."
    ),
    category="ingestion",
    input_schema=_AnalyzeFileArgs,
    handler=_handle_analyze_file,
    personas=frozenset({"accounting", "admin"}),
))
