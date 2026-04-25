"""poliza_export_service.py — render simulated pólizas as COI / CONTPAQi / SAT.

All three exporters consume the dict returned by ``bulk_simulate`` so we have
a single canonical source of journal entry lines. Each exporter returns plain
text/XML — the router wraps it in a Response with appropriate MIME and
filename. Nothing is persisted.

Formats implemented (intentionally simplified — match the structure real
accountants import, not every optional field):

* COI (Aspel)            — fixed-format batch text, one póliza per expense.
* CONTPAQi               — XML <Polizas><Poliza><Movimiento>…</Movimiento></Poliza></Polizas>.
* SAT pólizas (Anexo 24) — <PLZ:Polizas Version="1.3"> per SAT contabilidad
                           electrónica spec, one Poliza element per expense.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from xml.sax.saxutils import escape
from typing import Any


# ── Shared helpers ────────────────────────────────────────────────────────────

def _today() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d")


def _fmt_amount(s: str) -> str:
    return f"{Decimal(str(s or '0')):.2f}"


# ── COI (Aspel) ───────────────────────────────────────────────────────────────

def render_coi(bulk: dict[str, Any]) -> str:
    """COI batch: header line per póliza, then one detail line per movement.

    Layout (tab-separated, what Aspel COI's "Importar pólizas" accepts):
        H<TAB>YYYYMMDD<TAB>D<TAB>concepto
        D<TAB>cuenta<TAB>cargo<TAB>abono<TAB>concepto
    """
    out: list[str] = []
    for r in bulk.get("rows") or []:
        date = (r.get("date") or _today()).replace("-", "")
        concept = (r.get("description") or "")[:60].replace("\t", " ")
        out.append(f"H\t{date}\tD\t{concept}")
        for ln in r.get("lines") or []:
            out.append(
                "D\t" + "\t".join([
                    str(ln.get("account_code") or ""),
                    _fmt_amount(ln.get("debit")),
                    _fmt_amount(ln.get("credit")),
                    str(ln.get("note") or "")[:60],
                ])
            )
    return "\n".join(out) + "\n"


# ── CONTPAQi ──────────────────────────────────────────────────────────────────

def render_contpaqi(bulk: dict[str, Any]) -> str:
    """CONTPAQi póliza XML — one <Poliza> element per expense."""
    parts: list[str] = ['<?xml version="1.0" encoding="UTF-8"?>', "<Polizas>"]
    for r in bulk.get("rows") or []:
        fecha   = r.get("date") or _today()
        concept = escape(str(r.get("description") or ""))
        parts.append(
            f'  <Poliza Tipo="Dr" Folio="{r.get("expense_id")}" '
            f'Fecha="{fecha}" Concepto="{concept}">'
        )
        for ln in r.get("lines") or []:
            parts.append(
                "    <Movimiento "
                f'Cuenta="{escape(str(ln.get("account_code") or ""))}" '
                f'Cargo="{_fmt_amount(ln.get("debit"))}" '
                f'Abono="{_fmt_amount(ln.get("credit"))}" '
                f'Concepto="{escape(str(ln.get("note") or ""))}"/>'
            )
        parts.append("  </Poliza>")
    parts.append("</Polizas>")
    return "\n".join(parts)


# ── SAT pólizas (Anexo 24) ────────────────────────────────────────────────────

def render_sat_polizas(bulk: dict[str, Any], rfc: str = "XAXX010101000") -> str:
    """SAT 'Pólizas del periodo' XML (Anexo 24, Versión 1.3).

    A real implementation also requires CFDI UUIDs (CompNal) to be embedded
    per movement. We emit the structural skeleton — accountants then layer
    UUIDs on once CFDI pairing is wired up here.
    """
    now   = datetime.utcnow()
    anio  = now.strftime("%Y")
    mes   = now.strftime("%m")
    parts: list[str] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<PLZ:Polizas '
        'xmlns:PLZ="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xsi:schemaLocation="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo '
        'http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo/PolizasPeriodo_1_3.xsd" '
        f'Version="1.3" RFC="{escape(rfc)}" Mes="{mes}" Anio="{anio}" '
        'TipoSolicitud="AF" NumOrden="00000000000000000000">',
    ]
    for r in bulk.get("rows") or []:
        fecha   = r.get("date") or _today()
        concept = escape(str(r.get("description") or ""))
        parts.append(
            f'  <PLZ:Poliza NumUnIdenPol="EXP-{r.get("expense_id")}" '
            f'Fecha="{fecha}" Concepto="{concept}">'
        )
        for ln in r.get("lines") or []:
            parts.append(
                "    <PLZ:Transaccion "
                f'NumCta="{escape(str(ln.get("account_code") or ""))}" '
                f'DesCta="{escape(str(ln.get("account_name") or ""))}" '
                f'Concepto="{escape(str(ln.get("note") or ""))}" '
                f'Debe="{_fmt_amount(ln.get("debit"))}" '
                f'Haber="{_fmt_amount(ln.get("credit"))}"/>'
            )
        parts.append("  </PLZ:Poliza>")
    parts.append("</PLZ:Polizas>")
    return "\n".join(parts)


# ── Custom (template-based) ──────────────────────────────────────────────────

# Available placeholders are documented in the docstring below.
_LINE_KEYS = {"expense_id", "date", "description", "category_code",
              "amount", "account_code", "account_name", "debit", "credit",
              "note", "line_no", "balanced"}


def render_custom(
    bulk: dict[str, Any],
    line_template: str,
    header: str = "",
    footer: str = "",
    one_line_per: str = "movement",  # "movement" | "expense"
) -> str:
    """Render bulk pólizas using a user-defined line template.

    Placeholders ({key} style):
      Expense-level: expense_id, date, description, category_code, amount, balanced
      Line-level:    line_no, account_code, account_name, debit, credit, note

    one_line_per:
      "movement" → emit one output line per journal movement (debit/credit row)
      "expense"  → emit one output line per expense (no per-line vars)
    """
    if not line_template:
        return (header + "\n" if header else "") + (footer if footer else "")

    out: list[str] = []
    if header:
        out.append(header)

    for r in bulk.get("rows") or []:
        exp_ctx = {
            "expense_id":    r.get("expense_id"),
            "date":          r.get("date") or _today(),
            "description":   (r.get("description") or "").replace("\n", " "),
            "category_code": r.get("category_code") or "",
            "amount":        _fmt_amount(r.get("amount")),
            "balanced":      "1" if r.get("balanced") else "0",
        }
        if one_line_per == "expense":
            ctx = {**exp_ctx, "line_no": "", "account_code": "", "account_name": "",
                   "debit": "0.00", "credit": "0.00", "note": ""}
            try:
                out.append(line_template.format_map(_SafeDict(ctx)))
            except Exception as exc:
                out.append(f"# error formateando expense {r.get('expense_id')}: {exc}")
            continue
        for i, ln in enumerate(r.get("lines") or [], start=1):
            ctx = {
                **exp_ctx,
                "line_no":      i,
                "account_code": ln.get("account_code") or "",
                "account_name": ln.get("account_name") or "",
                "debit":        _fmt_amount(ln.get("debit")),
                "credit":       _fmt_amount(ln.get("credit")),
                "note":         (ln.get("note") or "").replace("\n", " "),
            }
            try:
                out.append(line_template.format_map(_SafeDict(ctx)))
            except Exception as exc:
                out.append(f"# error formateando expense {r.get('expense_id')} L{i}: {exc}")

    if footer:
        out.append(footer)
    return "\n".join(out) + "\n"


class _SafeDict(dict):
    """dict that returns '{key}' (literal) for missing keys instead of KeyError."""

    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def list_custom_placeholders() -> dict[str, list[str]]:
    """Return placeholder catalog for the UI."""
    return {
        "expense": ["expense_id", "date", "description", "category_code", "amount", "balanced"],
        "line":    ["line_no", "account_code", "account_name", "debit", "credit", "note"],
    }
