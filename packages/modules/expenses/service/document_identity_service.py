"""document_identity_service.py

Extracts lightweight, deterministic matching identity from uploaded documents.
No AI, no OCR.  Never raises -- returns None fields on any parse failure.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_any(root: ET.Element, tag: str) -> ET.Element | None:
    """First element at any depth whose local name matches *tag* (namespace-safe)."""
    return root.find(f".//{{*}}{tag}")


def _local(element: ET.Element) -> str:
    """Return the local tag name, stripping any Clark-notation namespace."""
    tag = element.tag
    return tag.split("}")[-1] if "}" in tag else tag


def _safe_float(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value.replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def _normalise_rfc(value: str | None) -> str | None:
    """Strip whitespace and uppercase an RFC string."""
    return value.strip().upper() if value and value.strip() else None


def _normalise_uuid(value: str | None) -> str | None:
    """Strip whitespace and uppercase a UUID string."""
    if not value or not value.strip():
        return None
    candidate = value.strip().upper()
    return candidate if _XML_UUID_RE.fullmatch(candidate) else None


# ---------------------------------------------------------------------------
# Compiled fallback patterns (used when attribute-level parsing misses)
# ---------------------------------------------------------------------------

# UUID pattern for both attribute values and raw-text fallback
_XML_UUID_RE = re.compile(
    r"[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}",
    re.IGNORECASE,
)

# RFC in raw XML text (3-4 letters/& + 6 digits + 3 alphanumeric homoclave)
_XML_RFC_RE = re.compile(
    r"\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b",
    re.IGNORECASE,
)

# Total — attribute-style value or labelled occurrence
_XML_TOTAL_ATTR_RE = re.compile(
    r'Total\s*=\s*"([0-9,]+\.\d{2})"',
    re.IGNORECASE,
)
_XML_TOTAL_LABEL_RE = re.compile(
    r"(?:Total|SubTotal)\s*[=:]\s*\"?([0-9,]+\.\d{2})\"?",
    re.IGNORECASE,
)

# ISO-8601 datetime or date
_XML_DATE_RE = re.compile(
    r"\b(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?:T[0-2]\d:[0-5]\d:[0-5]\d)?)\b"
)


# ---------------------------------------------------------------------------
# normalize_filename_stem
# ---------------------------------------------------------------------------

_DUPLICATE_SUFFIX_RE = re.compile(r"[\s_\-]+\(\d+\)$")
_SEPARATOR_RE = re.compile(r"[\s_\-]+")


def normalize_filename_stem(filename: str) -> str:
    """Return a normalised lowercase stem from *filename*.

    Steps:
    1. Strip the file extension.
    2. Lowercase.
    3. Collapse separator runs (spaces, underscores, hyphens) to a single
       underscore.
    4. Remove trailing duplicate-copy suffixes like ``_(1)``, ``-(2)``,
       `` (3)``.
    """
    stem = Path(filename).stem
    stem = stem.lower()
    stem = _DUPLICATE_SUFFIX_RE.sub("", stem)
    stem = _SEPARATOR_RE.sub("_", stem).strip("_")
    return stem


# ---------------------------------------------------------------------------
# extract_xml_identity
# ---------------------------------------------------------------------------

def extract_xml_identity(filename: str, content_text: str) -> dict:
    """Parse a CFDI XML string and return matching identity fields.

    Tolerates CFDI 3.3 and 4.0 namespace variants via wildcard ``{*}`` tag
    matching.  Normalises UUID and RFCs to uppercase.  Falls back to regex
    extraction on the raw text when the element-attribute path misses a value.

    Returns
    -------
    dict with keys:
        document_type  : "cfdi_xml"
        uuid           : str | None   — uppercase, 8-4-4-4-12
        total          : float | None
        issuer_rfc     : str | None   — uppercase
        receiver_rfc   : str | None   — uppercase
        document_date  : str | None   — ISO date or datetime from Fecha attr
        uso_cfdi       : str | None   — Receptor@UsoCFDI (e.g. 'G03', 'P01')
        forma_pago     : str | None   — Comprobante@FormaPago (e.g. '01' cash, '04' card)
        metodo_pago    : str | None   — Comprobante@MetodoPago ('PUE' | 'PPD')
        tipo_comprobante: str | None  — Comprobante@TipoDeComprobante ('I','E','P','N','T')
        currency_xml   : str | None   — Comprobante@Moneda ISO code
        filename_stem  : str
    """
    result: dict = {
        "document_type": "cfdi_xml",
        "uuid": None,
        "total": None,
        "issuer_rfc": None,
        "receiver_rfc": None,
        "document_date": None,
        "uso_cfdi": None,
        "forma_pago": None,
        "metodo_pago": None,
        "tipo_comprobante": None,
        "currency_xml": None,
        "issuer_zip": None,
        "receiver_zip": None,
        "issuer_regimen": None,
        "receiver_regimen": None,
        "filename_stem": normalize_filename_stem(filename),
    }

    if not content_text or not content_text.strip():
        return result

    # ── 1. Try structured XML parse ─────────────────────────────────────────
    # content_text may include extracted key/value metadata appended after
    # the XML document; slice off anything past the closing </Comprobante>
    # tag so ET.fromstring doesn't choke on "junk after document element".
    xml_slice = content_text
    end_m = re.search(r"</[^<>]*Comprobante\s*>", xml_slice)
    if end_m:
        xml_slice = xml_slice[: end_m.end()]
    try:
        root = ET.fromstring(xml_slice)
        _extract_xml_from_tree(root, result)
    except ET.ParseError:
        pass  # fall through to regex path

    # ── 2. Regex fallback for any field still None ───────────────────────────
    _extract_xml_from_text(content_text, result)

    return result


def _extract_xml_from_tree(root: ET.Element, result: dict) -> None:
    """Populate *result* from a parsed ElementTree.  Modifies in-place."""
    # Locate Comprobante — may be the root itself or nested
    comprobante = root if _local(root) == "Comprobante" else _find_any(root, "Comprobante")
    if comprobante is None:
        return

    # ── Total ────────────────────────────────────────────────────────────────
    # Prefer Total; fall back to SubTotal (draft CFDIs sometimes omit Total)
    total_str = (
        comprobante.attrib.get("Total")
        or comprobante.attrib.get("total")
        or comprobante.attrib.get("SubTotal")
        or comprobante.attrib.get("Subtotal")
    )
    result["total"] = _safe_float(total_str)

    # ── Fecha ────────────────────────────────────────────────────────────────
    result["document_date"] = (
        comprobante.attrib.get("Fecha")
        or comprobante.attrib.get("fecha")
    )
    # ── Comprobante-level CFDI attributes ──────────────────────────────────────
    def _ci_attr(el: ET.Element, *names: str) -> str | None:
        for n in names:
            v = el.attrib.get(n)
            if v is not None and str(v).strip():
                return str(v).strip()
        return None

    result["forma_pago"]       = _ci_attr(comprobante, "FormaPago", "formaDePago", "formapago")
    result["metodo_pago"]      = _ci_attr(comprobante, "MetodoPago", "metodoDePago", "metodopago")
    tipo = _ci_attr(comprobante, "TipoDeComprobante", "tipoDeComprobante", "tipodecomprobante")
    result["tipo_comprobante"] = tipo.upper() if tipo else None
    moneda = _ci_attr(comprobante, "Moneda", "moneda")
    result["currency_xml"]     = moneda.upper() if moneda else None
    # CFDI 4.0: Comprobante@LugarExpedicion is the issuer's postal code.
    result["issuer_zip"] = _ci_attr(
        comprobante, "LugarExpedicion", "lugarExpedicion", "lugarexpedicion"
    )
    # ── Emisor RFC + RegimenFiscal ─────────────────────────────────────────────
    emisor = _find_any(comprobante, "Emisor")
    if emisor is not None:
        rfc_raw = (
            emisor.attrib.get("Rfc")
            or emisor.attrib.get("RFC")
            or emisor.attrib.get("rfc")
        )
        result["issuer_rfc"] = _normalise_rfc(rfc_raw)
        result["issuer_regimen"] = _ci_attr(
            emisor, "RegimenFiscal", "regimenFiscal", "regimenfiscal"
        )

    # ── Receptor RFC + UsoCFDI + DomicilioFiscal + RegimenFiscalReceptor ──────
    receptor = _find_any(comprobante, "Receptor")
    if receptor is not None:
        rfc_raw = (
            receptor.attrib.get("Rfc")
            or receptor.attrib.get("RFC")
            or receptor.attrib.get("rfc")
        )
        result["receiver_rfc"] = _normalise_rfc(rfc_raw)
        uso = (
            receptor.attrib.get("UsoCFDI")
            or receptor.attrib.get("usoCFDI")
            or receptor.attrib.get("usocfdi")
            or comprobante.attrib.get("UsoCFDI")
        )
        result["uso_cfdi"] = uso.strip().upper() if uso and uso.strip() else None
        result["receiver_zip"] = _ci_attr(
            receptor, "DomicilioFiscalReceptor", "domicilioFiscalReceptor", "domiciliofiscalreceptor"
        )
        result["receiver_regimen"] = _ci_attr(
            receptor, "RegimenFiscalReceptor", "regimenFiscalReceptor", "regimenfiscalreceptor"
        )

    # ── UUID from TimbreFiscalDigital ─────────────────────────────────────────
    timbre = _find_any(comprobante, "TimbreFiscalDigital")
    if timbre is not None:
        uuid_raw = (
            timbre.attrib.get("UUID")
            or timbre.attrib.get("Uuid")
            or timbre.attrib.get("uuid")
        )
        result["uuid"] = _normalise_uuid(uuid_raw)


def _extract_xml_from_text(text: str, result: dict) -> None:
    """Regex-based fallback.  Only fills fields that are still None."""
    # UUID
    if result["uuid"] is None:
        m = _XML_UUID_RE.search(text)
        if m:
            result["uuid"] = m.group(0).upper()

    # Total
    if result["total"] is None:
        m = _XML_TOTAL_ATTR_RE.search(text)
        if m:
            result["total"] = _safe_float(m.group(1))
        else:
            m = _XML_TOTAL_LABEL_RE.search(text)
            if m:
                result["total"] = _safe_float(m.group(1))

    # RFCs (first two distinct matches = issuer, receiver)
    if result["issuer_rfc"] is None or result["receiver_rfc"] is None:
        rfcs = list(dict.fromkeys(
            m.group(1).upper() for m in _XML_RFC_RE.finditer(text)
        ))
        if result["issuer_rfc"] is None and len(rfcs) >= 1:
            result["issuer_rfc"] = rfcs[0]
        if result["receiver_rfc"] is None and len(rfcs) >= 2:
            result["receiver_rfc"] = rfcs[1]

    # Date
    if result["document_date"] is None:
        m = _XML_DATE_RE.search(text)
        if m:
            result["document_date"] = m.group(1)

    # Receptor / Emisor attributes — regex fallbacks so evaluator fields are
    # populated even when the structured XML parse failed.
    def _attr(pattern: str) -> str | None:
        m = re.search(pattern, text, re.IGNORECASE)
        return m.group(1).strip() if m else None

    if result["receiver_zip"] is None:
        result["receiver_zip"] = _attr(r'DomicilioFiscalReceptor\s*=\s*"([^"]+)"')
    if result["issuer_zip"] is None:
        result["issuer_zip"] = _attr(r'LugarExpedicion\s*=\s*"([^"]+)"')
    if result["uso_cfdi"] is None:
        v = _attr(r'UsoCFDI\s*=\s*"([^"]+)"')
        result["uso_cfdi"] = v.upper() if v else None
    if result["tipo_comprobante"] is None:
        v = _attr(r'TipoDeComprobante\s*=\s*"([^"]+)"')
        result["tipo_comprobante"] = v.upper() if v else None
    if result["forma_pago"] is None:
        result["forma_pago"] = _attr(r'FormaPago\s*=\s*"([^"]+)"')
    if result["metodo_pago"] is None:
        result["metodo_pago"] = _attr(r'MetodoPago\s*=\s*"([^"]+)"')
    if result["currency_xml"] is None:
        v = _attr(r'Moneda\s*=\s*"([^"]+)"')
        result["currency_xml"] = v.upper() if v else None
    if result["receiver_regimen"] is None:
        result["receiver_regimen"] = _attr(r'RegimenFiscalReceptor\s*=\s*"([^"]+)"')
    if result["issuer_regimen"] is None:
        # Emisor RegimenFiscal (not RegimenFiscalReceptor)
        m = re.search(r'(?<!Receptor)RegimenFiscal\s*=\s*"([^"]+)"', text, re.IGNORECASE)
        if m:
            result["issuer_regimen"] = m.group(1).strip()


# ---------------------------------------------------------------------------
# extract_pdf_identity
# ---------------------------------------------------------------------------

# Patterns used for best-effort text extraction from already-decoded PDF text.
_UUID_RE = re.compile(
    r"\b([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\b"
)
_RFC_RE = re.compile(r"\b([A-Z&]{3,4}[0-9]{6}[A-Z0-9]{3})\b")
_TOTAL_RE = re.compile(
    r"(?:total|importe\s+total|monto\s+total)[^\d]*?([\d,]+\.\d{2})",
    re.IGNORECASE,
)
_DATE_RE = re.compile(
    r"\b(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))"  # ISO date
    r"|"
    r"\b((?:0[1-9]|[12]\d|3[01])/(?:0[1-9]|1[0-2])/\d{4})\b"  # DD/MM/YYYY
)


def extract_pdf_identity(filename: str, content_text: str | None = None) -> dict:
    """Extract matching identity from a PDF document.

    No OCR is performed here.  *content_text* must be pre-extracted text if
    available (e.g. from pdfminer/pypdf).  When *content_text* is None or
    empty, all fields other than ``filename_stem`` are returned as None.

    Returns
    -------
    dict with keys:
        document_type  : "pdf"
        uuid           : str | None
        total          : float | None
        issuer_rfc     : str | None
        receiver_rfc   : str | None
        document_date  : str | None
        filename_stem  : str
    """
    result: dict = {
        "document_type": "pdf",
        "uuid": None,
        "total": None,
        "issuer_rfc": None,
        "receiver_rfc": None,
        "document_date": None,
        "filename_stem": normalize_filename_stem(filename),
    }

    if not content_text or not content_text.strip():
        return result

    text = content_text

    # UUID — first match wins
    uuid_m = _UUID_RE.search(text)
    if uuid_m:
        result["uuid"] = uuid_m.group(1).upper()

    # Total — labelled occurrence preferred
    total_m = _TOTAL_RE.search(text)
    if total_m:
        result["total"] = _safe_float(total_m.group(1))

    # RFC — up to two distinct matches: first = issuer, second = receiver
    rfcs = list(dict.fromkeys(m.group(1) for m in _RFC_RE.finditer(text)))
    if len(rfcs) >= 1:
        result["issuer_rfc"] = rfcs[0]
    if len(rfcs) >= 2:
        result["receiver_rfc"] = rfcs[1]

    # Date — first ISO or DD/MM/YYYY occurrence
    date_m = _DATE_RE.search(text)
    if date_m:
        result["document_date"] = date_m.group(1) or date_m.group(2)

    return result
