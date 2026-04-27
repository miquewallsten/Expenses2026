"""Phase 8.2 — OCR pipeline.

Pure-Python orchestrator around Tesseract / pdf2image with graceful fallback
when the native binaries (or their Python bindings) are unavailable so the
test suite + dev environments without Tesseract still import cleanly.

Public surface
--------------
extract_text(file_bytes, mime) -> str
    Best-effort text extraction. Returns "" when:
      • the mime type is not OCR-able
      • Tesseract / poppler are not installed
      • OCR raises any exception (logged but never propagated)

extract_fields(text) -> dict
    Heuristic field extraction (RFC, total, subtotal, tax, date, merchant,
    payment_method) from Spanish/English receipt text. All values optional —
    returns ``{}`` when nothing matched.
"""
from __future__ import annotations

import logging
import re
from io import BytesIO

logger = logging.getLogger(__name__)

# Best-effort imports — guard each so a missing OS-level binary cannot block
# module import. Callers must tolerate empty strings.
try:
    import pytesseract  # type: ignore[import-not-found]
    _PYTESSERACT_OK = True
except Exception:  # pragma: no cover
    pytesseract = None  # type: ignore[assignment]
    _PYTESSERACT_OK = False

try:
    from PIL import Image  # type: ignore[import-not-found]
    _PIL_OK = True
except Exception:  # pragma: no cover
    Image = None  # type: ignore[assignment]
    _PIL_OK = False

try:
    from pdf2image import convert_from_bytes  # type: ignore[import-not-found]
    _PDF2IMG_OK = True
except Exception:  # pragma: no cover
    convert_from_bytes = None  # type: ignore[assignment]
    _PDF2IMG_OK = False


# Tesseract languages: Spanish first (Mexican receipts dominant), English
# fallback. The Dockerfile installs both packages.
_TESS_LANGS = "spa+eng"
_MAX_PDF_PAGES = 10


def _ocr_image(img) -> str:
    if not _PYTESSERACT_OK:
        return ""
    try:
        return pytesseract.image_to_string(img, lang=_TESS_LANGS)  # type: ignore[union-attr]
    except Exception:  # pragma: no cover — Tesseract binary missing or bad image
        logger.exception("ocr_image failed")
        return ""


def extract_text(file_bytes: bytes, mime: str | None) -> str:
    """Return best-effort text content for *file_bytes*.

    Routing:
      • ``application/pdf`` → rasterize first ``_MAX_PDF_PAGES`` pages, OCR each.
      • ``image/*`` → OCR directly.
      • ``text/*``, ``application/json``, ``application/xml`` → utf-8 decode
        (latin-1 fallback) — useful for CFDI XML and CSV statement attachments.
      • Anything else → "".
    """
    if not file_bytes:
        return ""
    m = (mime or "").lower().strip()

    # Plain-text family — short-circuit, no OCR needed.
    if (
        m.startswith("text/")
        or m in {"application/json", "application/xml"}
        or m.endswith("+xml")
    ):
        try:
            return file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            try:
                return file_bytes.decode("latin-1")
            except Exception:
                return ""

    if m == "application/pdf":
        if not (_PDF2IMG_OK and _PIL_OK and _PYTESSERACT_OK):
            return ""
        try:
            pages = convert_from_bytes(file_bytes, first_page=1, last_page=_MAX_PDF_PAGES)  # type: ignore[misc]
        except Exception:  # pragma: no cover — poppler missing
            logger.exception("pdf2image conversion failed")
            return ""
        out: list[str] = []
        for img in pages:
            out.append(_ocr_image(img))
        return "\n".join(s for s in out if s).strip()

    if m.startswith("image/"):
        if not (_PIL_OK and _PYTESSERACT_OK):
            return ""
        try:
            img = Image.open(BytesIO(file_bytes))  # type: ignore[union-attr]
        except Exception:
            logger.exception("Pillow open failed")
            return ""
        return _ocr_image(img).strip()

    return ""


# ── Heuristic field extraction ─────────────────────────────────────────────────

# Mexican RFC: 4 letters (PM) or 3 letters (PF) + 6 digits + 3 alphanumerics
_RE_RFC = re.compile(
    r"\b([A-ZÑ&]{3,4})\d{6}([A-Z0-9]{3})\b",
    re.IGNORECASE,
)

# Total amount — looks for "total" (word-bounded so "Subtotal" doesn't match)
# followed by a number; tolerant of $, thousands separators (. , space) and
# decimal separators (. ,).
_AMOUNT_RE = (
    r"([0-9]{1,3}(?:[.,\s][0-9]{3})*(?:[.,][0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)"
)
_RE_TOTAL = re.compile(
    r"(?:\btotal\b|importe\s+total|gran\s+total|amount\s+due)[^0-9$]{0,12}\$?\s*"
    + _AMOUNT_RE,
    re.IGNORECASE,
)
_RE_SUBTOTAL = re.compile(
    r"\bsub[\s-]*total\b[^0-9$]{0,12}\$?\s*" + _AMOUNT_RE,
    re.IGNORECASE,
)
# IVA / Tax — Mexican IVA, generic "tax", "impuesto"
_RE_TAX = re.compile(
    r"(?:\biva\b|\btax\b|impuesto(?:\s+trasladado)?)[^0-9$]{0,12}\$?\s*" + _AMOUNT_RE,
    re.IGNORECASE,
)

# Payment method — match common ES/EN tokens; capture the canonical bucket.
# Order matters: more specific tokens first.
_PAYMENT_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bamerican\s+express\b|\bamex\b", re.IGNORECASE), "amex"),
    (re.compile(r"\bmastercard\b|\bmaster\s*card\b", re.IGNORECASE), "mastercard"),
    (re.compile(r"\bvisa\b", re.IGNORECASE), "visa"),
    (re.compile(r"\btarjeta\s+de\s+cr[eé]dito\b|\bcredit\s+card\b", re.IGNORECASE), "credit_card"),
    (re.compile(r"\btarjeta\s+de\s+d[eé]bito\b|\bdebit\s+card\b", re.IGNORECASE), "debit_card"),
    (re.compile(r"\btarjeta\b|\bcard\b", re.IGNORECASE), "card"),
    (re.compile(r"\befectivo\b|\bcash\b", re.IGNORECASE), "cash"),
    (re.compile(r"\btransferencia\b|\bspei\b|\btransfer\b|\bwire\b", re.IGNORECASE), "transfer"),
]

# Date — supports YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY
_RE_DATE_ISO = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")
_RE_DATE_DMY = re.compile(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b")


def _normalize_amount(raw: str) -> str | None:
    """Convert ``"1,234.56"`` / ``"1.234,56"`` → ``"1234.56"``."""
    s = raw.strip().replace(" ", "")
    if not s:
        return None
    if "," in s and "." in s:
        # Last separator wins as decimal.
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        # Could be thousands or decimal — heuristic: 1-2 chars after last comma → decimal.
        if len(s.split(",")[-1]) in (1, 2):
            s = s.replace(",", ".")
        else:
            s = s.replace(",", "")
    try:
        return f"{float(s):.2f}"
    except ValueError:
        return None


def extract_fields(text: str) -> dict:
    """Pull common receipt fields out of *text* via regex heuristics.

    Returns a dict with any subset of: ``rfc``, ``total``, ``subtotal``,
    ``tax``, ``date``, ``merchant``, ``payment_method``. Missing fields are
    simply absent.
    """
    if not text:
        return {}
    out: dict[str, str] = {}

    m = _RE_RFC.search(text)
    if m:
        out["rfc"] = m.group(0).upper()

    m = _RE_TOTAL.search(text)
    if m:
        amt = _normalize_amount(m.group(1))
        if amt is not None:
            out["total"] = amt

    m = _RE_SUBTOTAL.search(text)
    if m:
        amt = _normalize_amount(m.group(1))
        if amt is not None:
            out["subtotal"] = amt

    m = _RE_TAX.search(text)
    if m:
        amt = _normalize_amount(m.group(1))
        if amt is not None:
            out["tax"] = amt

    for pattern, label in _PAYMENT_PATTERNS:
        if pattern.search(text):
            out["payment_method"] = label
            break

    m = _RE_DATE_ISO.search(text)
    if m:
        out["date"] = m.group(1)
    else:
        m = _RE_DATE_DMY.search(text)
        if m:
            out["date"] = m.group(1)

    # First non-empty line that doesn't look like a header is treated as merchant.
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        # Skip lines that are obviously not a vendor name.
        if _RE_RFC.fullmatch(line):
            continue
        if line.lower().startswith(("total", "subtotal", "iva", "fecha", "date", "rfc")):
            continue
        if len(line) < 3 or len(line) > 80:
            continue
        out["merchant"] = line
        break

    return out
