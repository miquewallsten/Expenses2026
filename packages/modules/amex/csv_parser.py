"""American Express CSV statement parser.

Amex statement CSVs come in several flavours:
- US: ``Date, Description, Amount, ...``
- MX: ``Fecha, Descripción, Importe, ...``
- "Activity" export with ``Extended Details``, ``Address`` etc.

This parser is tolerant: it resolves columns by fuzzy header match and
ignores everything it doesn't need. Amounts are parsed as Decimal and
normalised to positive (debits/charges). Credits (negative amounts) are
still kept but flagged via ``is_credit``.
"""
from __future__ import annotations

import csv
import io
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation


@dataclass
class ParsedLine:
    line_no: int
    posted_date: date | None
    description: str
    merchant: str | None
    amount: Decimal  # always positive
    is_credit: bool
    currency: str
    reference: str | None


@dataclass
class ParsedStatement:
    lines: list[ParsedLine]
    currency: str
    card_last4: str | None
    period_start: date | None
    period_end: date | None
    total_amount: Decimal


# Canonical column aliases → list of header substrings we accept.
_HEADER_ALIASES: dict[str, tuple[str, ...]] = {
    "date":        ("date", "fecha", "transaction date", "posted date", "fecha operacion", "fecha de transaccion"),
    "description": ("description", "descripcion", "details", "detalle", "concepto", "merchant", "payee"),
    "merchant":    ("merchant", "comercio", "payee"),
    "amount":      ("amount", "importe", "monto", "cargo", "debit", "debito"),
    "reference":   ("reference", "referencia", "reference number"),
    "card":        ("card member", "card no", "tarjeta", "card number", "last 4"),
    "currency":    ("currency", "moneda"),
}


def _strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _normalise(s: str) -> str:
    return _strip_accents(s or "").strip().lower()


def _match_header(field_names: list[str], canonical: str) -> str | None:
    """Find the first CSV column whose normalised header contains any alias."""
    aliases = _HEADER_ALIASES[canonical]
    norm_map = {_normalise(h): h for h in field_names}
    for n, orig in norm_map.items():
        if any(a in n for a in aliases):
            return orig
    return None


def _parse_date(raw: str | None) -> date | None:
    if not raw:
        return None
    s = raw.strip()
    # Try a handful of common formats.
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%m/%d/%y", "%d-%m-%Y", "%b %d %Y", "%d %b %Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    # Final fallback: isoparse-ish
    try:
        return datetime.fromisoformat(s[:10]).date()
    except ValueError:
        return None


def _parse_amount(raw: str | None) -> tuple[Decimal, bool]:
    """Return (abs_amount, is_credit). Handles $, commas, parens-for-negative."""
    if raw is None:
        return Decimal("0"), False
    s = str(raw).strip()
    if not s:
        return Decimal("0"), False
    neg = False
    if s.startswith("(") and s.endswith(")"):
        neg = True
        s = s[1:-1]
    # Strip currency symbols and thousands separators
    s = re.sub(r"[^\d\-.,]", "", s)
    # Convert European "1.234,56" → "1234.56"
    if s.count(",") == 1 and s.count(".") >= 1 and s.rfind(",") > s.rfind("."):
        s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(",", "")
    if s.startswith("-"):
        neg = True
        s = s[1:]
    try:
        n = Decimal(s or "0").quantize(Decimal("0.01"))
    except InvalidOperation:
        n = Decimal("0")
    return n, neg


def _detect_card_last4(rows: list[dict], col: str | None) -> str | None:
    if not col:
        return None
    for row in rows:
        v = row.get(col)
        if not v:
            continue
        m = re.search(r"(\d{4})(?!.*\d)", str(v))
        if m:
            return m.group(1)
    return None


def parse_amex_csv(data: bytes) -> ParsedStatement:
    """Parse an Amex statement CSV.

    Raises ``ValueError`` if no recognisable date/amount columns are found.
    """
    # Try utf-8-sig first (Amex often exports with BOM), then latin-1.
    text: str
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("latin-1", errors="replace")

    # Amex activity exports sometimes include preamble lines before the
    # real header. Sniff by finding the first line that contains "Date" /
    # "Fecha" AND "Amount" / "Importe".
    lines = text.splitlines()
    header_idx = 0
    for i, ln in enumerate(lines[:15]):
        low = _normalise(ln)
        if ("date" in low or "fecha" in low) and ("amount" in low or "importe" in low or "monto" in low):
            header_idx = i
            break
    cleaned = "\n".join(lines[header_idx:])
    reader = csv.DictReader(io.StringIO(cleaned))
    rows = [r for r in reader if any((v or "").strip() for v in r.values())]
    if not reader.fieldnames:
        raise ValueError("CSV has no header row")

    col_date = _match_header(list(reader.fieldnames), "date")
    col_desc = _match_header(list(reader.fieldnames), "description")
    col_merchant = _match_header(list(reader.fieldnames), "merchant")
    col_amount = _match_header(list(reader.fieldnames), "amount")
    col_ref = _match_header(list(reader.fieldnames), "reference")
    col_card = _match_header(list(reader.fieldnames), "card")
    col_currency = _match_header(list(reader.fieldnames), "currency")

    if not col_date or not col_amount:
        raise ValueError(
            f"CSV missing required columns (date/amount). Headers seen: {reader.fieldnames}"
        )

    parsed_lines: list[ParsedLine] = []
    total = Decimal("0")
    period_min: date | None = None
    period_max: date | None = None
    currency_val = "MXN"

    for i, row in enumerate(rows, start=1):
        d = _parse_date(row.get(col_date))
        desc = (row.get(col_desc) or row.get(col_merchant) or "").strip() or f"Cargo {i}"
        merchant = (row.get(col_merchant) or "").strip() or None
        amount, is_credit = _parse_amount(row.get(col_amount))
        if amount == 0 and not desc:
            continue
        ref = (row.get(col_ref) or "").strip() or None
        if col_currency:
            cur = (row.get(col_currency) or "").strip() or currency_val
            if cur:
                currency_val = cur.upper()[:10]

        parsed_lines.append(
            ParsedLine(
                line_no=i,
                posted_date=d,
                description=desc[:500],
                merchant=(merchant or "")[:255] or None,
                amount=amount,
                is_credit=is_credit,
                currency=currency_val,
                reference=ref,
            )
        )
        if not is_credit:
            total += amount
        if d:
            period_min = d if period_min is None or d < period_min else period_min
            period_max = d if period_max is None or d > period_max else period_max

    return ParsedStatement(
        lines=parsed_lines,
        currency=currency_val,
        card_last4=_detect_card_last4(rows, col_card),
        period_start=period_min,
        period_end=period_max,
        total_amount=total.quantize(Decimal("0.01")),
    )
