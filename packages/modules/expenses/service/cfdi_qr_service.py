"""cfdi_qr_service.py

Detects and classifies QR content found inside already-extracted text from
Mexican fiscal PDFs or images.

No AI.  No OCR.  Never raises -- returns empty list / None / unknown-typed
dicts on any failure.

SAT CFDI QR URL format (as of CFDI 4.0):
  https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx
  ?id=<UUID>&re=<EmisorRFC>&rr=<ReceptorRFC>&tt=<Total>&fe=<Sello[-8:]>

The URL may appear verbatim in OCR-extracted text, or only the query-string
portion may be present when the QR scanner produced a partial capture.
"""

from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse


# ---------------------------------------------------------------------------
# Constants / compiled patterns
# ---------------------------------------------------------------------------

# Domain fragment that unambiguously identifies a SAT CFDI validation URL
_SAT_DOMAIN = "verificacfdi.facturaelectronica.sat.gob.mx"

# UUID: 8-4-4-4-12 hex groups (case-insensitive in source, normalised to upper)
_UUID_RE = re.compile(
    r"\b([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})\b"
)

# Mexican RFC: 3-4 letters + 6-digit date + 3 homoclave chars
_RFC_RE = re.compile(r"\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b", re.IGNORECASE)

# Numeric total (handles leading zeroes padded by SAT, e.g. "000001234.56")
_TOTAL_RE = re.compile(r"\b(\d{1,12}(?:\.\d{1,6})?)\b")

# Minimum set of CFDI QR query-param keys that must be present together
_CFDI_QR_REQUIRED_PARAMS = {"id", "re", "rr", "tt"}

# Patterns that signal a URL or query fragment worth extracting as a candidate:
#   • full SAT URL
#   • bare query string starting with ?id= or id= (no scheme)
_CANDIDATE_PATTERNS = [
    re.compile(
        r"https?://verificacfdi\.facturaelectronica\.sat\.gob\.mx[^\s\"'<>]*",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:^|\s|\|)(\??id=[0-9A-Fa-f\-]{36}[^\s\"'<>]*)",
        re.IGNORECASE,
    ),
]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _safe_float(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return float(value.replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def _parse_cfdi_qs(qs: str) -> dict:
    """Parse a CFDI query string and return extracted fields."""
    params = parse_qs(qs, keep_blank_values=False)
    # parse_qs returns lists; take first value for each key
    flat = {k.lower(): v[0] for k, v in params.items() if v}

    uuid_raw   = flat.get("id")
    issuer_rfc = flat.get("re")
    recvr_rfc  = flat.get("rr")
    total_raw  = flat.get("tt")
    # fe (sello fragment) is intentionally ignored -- not useful for matching

    uuid = uuid_raw.upper() if uuid_raw and _UUID_RE.fullmatch(uuid_raw.strip()) else None
    total = _safe_float(total_raw)

    return {
        "uuid":         uuid,
        "issuer_rfc":   issuer_rfc.upper() if issuer_rfc else None,
        "receiver_rfc": recvr_rfc.upper()  if recvr_rfc  else None,
        "total":        total,
    }


def _qs_from_url(url: str) -> str:
    """Return the query string portion of *url* (without leading '?')."""
    parsed = urlparse(url)
    return parsed.query or ""


def _has_cfdi_params(qs: str) -> bool:
    keys = {k.lower() for k in parse_qs(qs, keep_blank_values=False)}
    return _CFDI_QR_REQUIRED_PARAMS.issubset(keys)


# ---------------------------------------------------------------------------
# extract_qr_candidates_from_text
# ---------------------------------------------------------------------------

def extract_qr_candidates_from_text(content_text: str | None) -> list[str]:
    """Scan *content_text* for CFDI SAT validation URLs or CFDI-like query
    strings and return them as a list of raw candidate strings.

    Suitable as input to :func:`classify_qr_payload`.  Returns an empty list
    when nothing recognisable is found.
    """
    if not content_text:
        return []

    candidates: list[str] = []
    seen: set[str] = set()

    for pattern in _CANDIDATE_PATTERNS:
        for match in pattern.finditer(content_text):
            # group(1) contains the captured text for the second pattern;
            # group(0) for the first (full match).
            candidate = (match.group(1) if match.lastindex and match.lastindex >= 1
                         else match.group(0)).strip()
            if candidate and candidate not in seen:
                seen.add(candidate)
                candidates.append(candidate)

    return candidates


# ---------------------------------------------------------------------------
# classify_qr_payload
# ---------------------------------------------------------------------------

def classify_qr_payload(payload: str) -> dict:
    """Classify a single QR payload string and extract CFDI identity fields.

    Parameters
    ----------
    payload:
        Raw string value decoded from a QR code (or extracted from text).

    Returns
    -------
    dict with keys:
        qr_type      : "cfdi_sat" | "generic" | "unknown"
        is_cfdi_qr   : bool
        uuid         : str | None
        issuer_rfc   : str | None
        receiver_rfc : str | None
        total        : float | None
        raw_payload  : str
    """
    result: dict = {
        "qr_type":      "unknown",
        "is_cfdi_qr":   False,
        "uuid":         None,
        "issuer_rfc":   None,
        "receiver_rfc": None,
        "total":        None,
        "raw_payload":  payload,
    }

    if not payload or not payload.strip():
        return result

    stripped = payload.strip()

    # ── Try as full URL first ────────────────────────────────────────────────
    if _SAT_DOMAIN.lower() in stripped.lower():
        qs = _qs_from_url(stripped)
        if _has_cfdi_params(qs):
            fields = _parse_cfdi_qs(qs)
            result.update(fields)
            result["qr_type"]    = "cfdi_sat"
            result["is_cfdi_qr"] = True
            return result

    # ── Try as bare query string (with or without leading '?') ───────────────
    bare_qs = stripped.lstrip("?")
    if _has_cfdi_params(bare_qs):
        fields = _parse_cfdi_qs(bare_qs)
        result.update(fields)
        # Determine sub-type: if we got here without the SAT domain it may be
        # a partial capture of the same URL — still CFDI.
        result["qr_type"]    = "cfdi_sat"
        result["is_cfdi_qr"] = True
        return result

    # ── Fallback: try to salvage UUID / RFCs from free-form text ────────────
    uuid_match = _UUID_RE.search(stripped)
    if uuid_match:
        result["uuid"] = uuid_match.group(1).upper()

    rfc_matches = _RFC_RE.findall(stripped)
    if len(rfc_matches) >= 1:
        result["issuer_rfc"]   = rfc_matches[0].upper()
    if len(rfc_matches) >= 2:
        result["receiver_rfc"] = rfc_matches[1].upper()

    total_match = _TOTAL_RE.search(stripped)
    if total_match:
        result["total"] = _safe_float(total_match.group(1))

    # Mark as generic if it looks like a URL/URI but not SAT, or as unknown
    # if it's opaque text.
    if stripped.startswith(("http://", "https://", "www.")):
        result["qr_type"] = "generic"
    elif result["uuid"]:
        # Has a UUID but not in CFDI-QR format — still informative
        result["qr_type"] = "generic"

    return result


# ---------------------------------------------------------------------------
# extract_cfdi_qr_identity
# ---------------------------------------------------------------------------

def extract_cfdi_qr_identity(filename: str, content_text: str | None) -> dict | None:
    """Inspect QR candidates extracted from *content_text* and return the best
    CFDI QR identity found, or ``None`` if no CFDI QR was detected.

    The returned dict matches the shape produced by
    :func:`classify_qr_payload` with ``is_cfdi_qr=True``, plus a
    ``filename`` field for traceability.

    Selection strategy: prefer the candidate with the highest completeness
    (UUID + both RFCs + total > UUID only) to handle rare cases where
    multiple URL fragments appear in one document.
    """
    candidates = extract_qr_candidates_from_text(content_text)
    if not candidates:
        return None

    cfdi_results: list[dict] = []
    for raw in candidates:
        classified = classify_qr_payload(raw)
        if classified["is_cfdi_qr"]:
            cfdi_results.append(classified)

    if not cfdi_results:
        return None

    def _completeness(r: dict) -> int:
        return (
            (1 if r["uuid"]         else 0) +
            (1 if r["issuer_rfc"]   else 0) +
            (1 if r["receiver_rfc"] else 0) +
            (1 if r["total"]        else 0)
        )

    best = max(cfdi_results, key=_completeness)
    best["filename"] = filename
    return best
