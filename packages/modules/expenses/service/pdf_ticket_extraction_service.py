"""
pdf_ticket_extraction_service.py
---------------------------------
V1 heuristic extraction for plain-text content from PDF receipts and scanned
tickets. No ML, no external deps — pure stdlib regex and string matching.
"""

import re

# ── Constants ─────────────────────────────────────────────────────────────────

_CATEGORY_KEYWORDS: list[tuple[str, str]] = [
    (r"hotel|hospedaje|alojamiento",                    "lodging"),
    (r"uber|taxi|cab|toll|caseta|gasolina|gas|diesel",  "transport"),
    (r"restaurant|restaurante|cafe|café|comida|food",   "meals"),
    (r"telecom|internet|telefono|teléfono|telcel|movistar|telmex", "telecom"),
]

# Money patterns: optional currency symbol/code, then digits with optional
# thousands separator and decimal part.
_AMOUNT_RE = re.compile(
    r"""
    (?:MXN|USD|\$|€)?\s*          # optional currency prefix
    (?P<amount>
        \d{1,3}(?:[,\s]\d{3})*    # thousands groups
        (?:\.\d{2})?               # optional cents
        |
        \d+\.\d{2}                 # plain decimal
    )
    \s*(?:MXN|USD)?               # optional currency suffix
    """,
    re.VERBOSE | re.IGNORECASE,
)

# ISO date: 2024-03-15
_DATE_ISO_RE = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")
# Localised date: 15/03/2024 or 15-03-2024
_DATE_LOCAL_RE = re.compile(r"\b(\d{2}[/-]\d{2}[/-]\d{4})\b")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _detect_amount(text: str) -> str | None:
    """Return the largest plausible monetary amount found in text."""
    candidates: list[float] = []
    for m in _AMOUNT_RE.finditer(text):
        raw = m.group("amount").replace(",", "").replace(" ", "")
        try:
            value = float(raw)
        except ValueError:
            continue
        # Ignore implausible values: single digits or unrealistically large.
        if 1.0 <= value <= 999_999.99:
            candidates.append(value)
    if not candidates:
        return None
    best = max(candidates)
    return f"{best:.2f}"


def _detect_vendor(text: str) -> str | None:
    """Return the first non-empty, non-numeric line as a probable vendor name.

    Skips known CFDI / receipt boilerplate labels so we don't end up with a
    description like "TIPO DE COMPROBANTE: I Ingreso" when the first line of
    a CFDI PDF happens to be a form label rather than the emisor name.
    """
    # Patterns that identify label/boilerplate lines in CFDI PDFs and generic
    # receipts. Matched case-insensitively against the stripped line.
    label_patterns = (
        r"tipo\s+de\s+comprobante",
        r"folio\s+fiscal",
        r"uuid\b",
        r"rfc\b",
        r"r\.?f\.?c\.?",
        r"regimen\s+fiscal",
        r"r[eé]gimen\s+fiscal",
        r"uso\s+de\s+cfdi",
        r"uso\s+cfdi",
        r"m[eé]todo\s+de\s+pago",
        r"forma\s+de\s+pago",
        r"lugar\s+de\s+expedici[oó]n",
        r"certificado\s+sat",
        r"cadena\s+original",
        r"sello\s+digital",
        r"subtotal\b",
        r"total\b",
        r"iva\b",
        r"factura\s+electr[oó]nica",
        r"comprobante\s+fiscal",
        r"serie\s*y\s*folio",
        r"fecha\s+de\s+emisi[oó]n",
        r"fecha\s+de\s+timbrado",
        r"no\.?\s*de\s+certificado",
    )
    label_re = re.compile("|".join(label_patterns), re.IGNORECASE)

    for line in text.splitlines():
        stripped = line.strip()
        # Skip blank lines and lines that are all numbers / punctuation.
        if not stripped:
            continue
        if re.fullmatch(r"[\d\s\W]+", stripped):
            continue
        # Skip very short tokens (likely labels like "RFC", "IVA", etc.)
        if len(stripped) < 4:
            continue
        # Skip CFDI / receipt form labels.
        if label_re.search(stripped):
            continue
        return stripped[:80]  # cap to a reasonable length
    return None


def _detect_date(text: str) -> str | None:
    """Return the first date found; prefer ISO format."""
    m = _DATE_ISO_RE.search(text)
    if m:
        return m.group(1)
    m = _DATE_LOCAL_RE.search(text)
    if m:
        return m.group(1)
    return None


def _detect_category(text: str) -> str:
    lower = text.lower()
    for pattern, category in _CATEGORY_KEYWORDS:
        if re.search(pattern, lower):
            return category
    return "unknown"


def _build_summary(amount: str | None, vendor: str | None, date: str | None, category: str) -> str:
    parts: list[str] = []
    if vendor:
        parts.append(vendor)
    if amount:
        parts.append(f"${amount}")
    if date:
        parts.append(date)
    if category != "unknown":
        parts.append(category)
    return " · ".join(parts) if parts else "No structured data extracted."


# ── Public API ────────────────────────────────────────────────────────────────

def extract_ticket_signals(content_text: str | None) -> dict:
    """
    Run heuristic extraction over plain-text ticket/PDF content.

    Returns a dict with keys:
        amount, vendor_name, date, probable_category, confidence, raw_summary
    """
    empty: dict = {
        "amount":            None,
        "vendor_name":       None,
        "date":              None,
        "probable_category": "unknown",
        "confidence":        "low",
        "raw_summary":       "No content provided.",
    }

    if not content_text or not content_text.strip():
        return empty

    text = content_text.strip()

    amount      = _detect_amount(text)
    vendor_name = _detect_vendor(text)
    date        = _detect_date(text)
    category    = _detect_category(text)
    confidence  = "medium" if (amount or vendor_name) else "low"
    raw_summary = _build_summary(amount, vendor_name, date, category)

    return {
        "amount":            amount,
        "vendor_name":       vendor_name,
        "date":              date,
        "probable_category": category,
        "confidence":        confidence,
        "raw_summary":       raw_summary,
    }
