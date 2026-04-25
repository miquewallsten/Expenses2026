"""Policy ↔ Setting mirror.

Maps an extracted `rule_json` onto an equivalent toggle on
`CompanyExpensePolicy` when one exists.  The admin UI uses this to offer a
one-click "apply as setting instead of policy" path — which is cheaper at
runtime (no rule evaluation) and surfaces the state in the normal settings UI.

A suggestion is only emitted when the rule maps cleanly and unambiguously to
a single setting change.  Ambiguous or multi-clause rules return None.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from packages.core.platform.models_expense_policy import CompanyExpensePolicy


@dataclass
class SettingSuggestion:
    setting_key: str           # e.g. "xml_required_mode"
    setting_label: str         # UX label, in Spanish
    current_value: Any
    suggested_value: Any
    value_label: str           # human rendering of suggested_value
    note: str                  # 1-line justification shown to the admin
    already_applied: bool = False  # True when current_value == suggested_value

    def to_dict(self) -> dict[str, Any]:
        return {
            "setting_key": self.setting_key,
            "setting_label": self.setting_label,
            "current_value": self.current_value,
            "suggested_value": self.suggested_value,
            "value_label": self.value_label,
            "note": self.note,
            "already_applied": self.already_applied,
        }


# ── Rule-pattern detectors ────────────────────────────────────────────────────


def _clauses(rule_json: dict[str, Any]) -> list[dict[str, Any]]:
    when = rule_json.get("when")
    if not isinstance(when, list):
        return []
    return [c for c in when if isinstance(c, dict)]


def _is_block(rule_json: dict[str, Any]) -> bool:
    then = rule_json.get("then")
    if not isinstance(then, dict):
        return False
    return str(then.get("action", "")).lower() == "block"


def _match_xml_always(clauses: list[dict[str, Any]]) -> bool:
    """Matches: has_xml == false  (always require XML)."""
    if len(clauses) != 1:
        return False
    c = clauses[0]
    return (
        c.get("field") == "has_xml"
        and c.get("op") == "="
        and _as_bool(c.get("value")) is False
    )


def _match_xml_mxn_only(clauses: list[dict[str, Any]]) -> bool:
    """Matches: currency == MXN AND has_xml == false."""
    if len(clauses) != 2:
        return False
    by_field = {str(c.get("field")): c for c in clauses}
    cur = by_field.get("currency")
    xml = by_field.get("has_xml")
    if not cur or not xml:
        return False
    return (
        cur.get("op") == "="
        and str(cur.get("value", "")).upper() == "MXN"
        and xml.get("op") == "="
        and _as_bool(xml.get("value")) is False
    )


def _match_block_international(clauses: list[dict[str, Any]]) -> bool:
    """Matches: is_international == true  (disallow international)."""
    if len(clauses) != 1:
        return False
    c = clauses[0]
    return (
        c.get("field") == "is_international"
        and c.get("op") == "="
        and _as_bool(c.get("value")) is True
    )


def _match_block_tickets(clauses: list[dict[str, Any]]) -> bool:
    """Matches: expense_type == 'ticket'  (disallow ticket-only expenses)."""
    if len(clauses) != 1:
        return False
    c = clauses[0]
    return (
        c.get("field") == "expense_type"
        and c.get("op") == "="
        and str(c.get("value", "")).lower() in ("ticket", "tickets")
    )


def _match_require_justification(clauses: list[dict[str, Any]]) -> bool:
    """Matches: any clause stating a justification is required.

    We look for a single `has_notes == false` clause (i.e. "block when notes are
    missing, for all expenses").  Amount-conditional variants stay as policies.
    """
    if len(clauses) != 1:
        return False
    c = clauses[0]
    return (
        c.get("field") == "has_notes"
        and c.get("op") == "="
        and _as_bool(c.get("value")) is False
    )


def _match_require_proof(clauses: list[dict[str, Any]]) -> bool:
    """Matches: single clause meaning "comprobante / proof is required".

    Heuristic: has_xml == false combined with nothing else, but only when
    paired with the word "comprobante" — we can't disambiguate from XML-only;
    so this matcher is intentionally strict and fires only when the rule's
    then.field is 'proof' or then.message mentions 'comprobante' and when
    contains a single has_xml=false clause.  Kept narrow on purpose; if it
    doesn't match, the rule remains a policy.
    """
    # Intentionally conservative: we return False here because has_xml=false
    # already maps to xml_required_mode=always. Proof is a separate concept
    # (PDF/image receipt); admins who want that should use the settings UI
    # directly. Kept as a named placeholder for symmetry.
    return False


def _as_bool(v: Any) -> bool | None:
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        s = v.strip().lower()
        if s in ("true", "1", "yes", "si", "sí"):
            return True
        if s in ("false", "0", "no"):
            return False
    return None


# ── Public detector ───────────────────────────────────────────────────────────


def detect_setting_suggestion(
    db: Session,
    company_id: int,
    rule_json: dict[str, Any],
) -> SettingSuggestion | None:
    """Return a SettingSuggestion if *rule_json* is equivalent to a toggle
    change on CompanyExpensePolicy, otherwise None.

    Only considered when the rule blocks — warn-level rules always stay as
    policies because settings can't express "warn".
    """
    if not isinstance(rule_json, dict) or not _is_block(rule_json):
        return None

    policy = (
        db.query(CompanyExpensePolicy)
        .filter(CompanyExpensePolicy.company_id == company_id)
        .first()
    )
    if policy is None:
        return None

    clauses = _clauses(rule_json)
    if not clauses:
        return None

    def _suggest(
        key: str, label: str, current: Any, suggested: Any, value_label: str, note: str
    ) -> SettingSuggestion:
        return SettingSuggestion(
            setting_key=key,
            setting_label=label,
            current_value=current,
            suggested_value=suggested,
            value_label=value_label,
            note=note,
            already_applied=(current == suggested),
        )

    # 1. XML always required
    if _match_xml_always(clauses):
        return _suggest(
            "xml_required_mode",
            "Requisito de XML (CFDI)",
            policy.xml_required_mode,
            "always",
            "Siempre requerido",
            "Equivale a exigir XML en todos los gastos.",
        )

    # 2. XML required only for MXN
    if _match_xml_mxn_only(clauses):
        return _suggest(
            "xml_required_mode",
            "Requisito de XML (CFDI)",
            policy.xml_required_mode,
            "mxn_only",
            "Sólo para gastos en MXN",
            "Equivale a exigir XML únicamente para gastos en pesos.",
        )

    # 3. Block international expenses
    if _match_block_international(clauses):
        return _suggest(
            "international_expenses_allowed",
            "Gastos internacionales",
            bool(policy.international_expenses_allowed),
            False,
            "No permitidos",
            "Equivale a deshabilitar los gastos internacionales.",
        )

    # 4. Block tickets-only
    if _match_block_tickets(clauses):
        return _suggest(
            "tickets_allowed",
            "Tickets (sin factura)",
            bool(policy.tickets_allowed),
            False,
            "No permitidos",
            "Equivale a deshabilitar gastos comprobados sólo con ticket.",
        )

    # 5. Require justification (no amount threshold)
    if _match_require_justification(clauses):
        return _suggest(
            "require_justification",
            "Justificación obligatoria",
            bool(policy.require_justification),
            True,
            "Obligatoria",
            "Equivale a pedir una nota aclaratoria en todos los gastos.",
        )

    # 6. Require proof (receipt/comprobante)
    if _match_require_proof(clauses):
        return _suggest(
            "require_proof",
            "Comprobante obligatorio",
            bool(policy.require_proof),
            True,
            "Obligatorio",
            "Equivale a exigir comprobante (PDF/imagen) en todos los gastos.",
        )

    return None


# ── Applier ──────────────────────────────────────────────────────────────────


ALLOWED_KEYS = {
    "xml_required_mode":               {"always", "mxn_only", "never"},
    "international_expenses_allowed":  {True, False},
    "tickets_allowed":                 {True, False},
    "require_justification":           {True, False},
    "require_proof":                   {True, False},
    "allow_document_free_expenses":    {True, False},
    "pdf_pair_required_for_cfdi":      {True, False},
    "allow_split_allocations":         {True, False},
}


def apply_setting(
    db: Session,
    company_id: int,
    setting_key: str,
    value: Any,
) -> CompanyExpensePolicy:
    if setting_key not in ALLOWED_KEYS:
        raise ValueError(f"Ajuste no soportado: {setting_key!r}.")
    allowed_values = ALLOWED_KEYS[setting_key]
    if value not in allowed_values:
        raise ValueError(f"Valor inválido para {setting_key!r}: {value!r}.")

    policy = (
        db.query(CompanyExpensePolicy)
        .filter(CompanyExpensePolicy.company_id == company_id)
        .first()
    )
    if policy is None:
        raise ValueError("La empresa no tiene una política de gastos configurada.")

    setattr(policy, setting_key, value)
    db.commit()
    db.refresh(policy)
    return policy


# ── Settings snapshot (for LLM context + UI) ─────────────────────────────────


def build_settings_snapshot(
    db: Session, company_id: int
) -> dict[str, Any] | None:
    """Return a serialisable view of the active CompanyExpensePolicy.

    Used by the extractor to inform the LLM about current toggles and by the
    preview endpoint so the UI can warn about redundant policies.
    """
    policy = (
        db.query(CompanyExpensePolicy)
        .filter(CompanyExpensePolicy.company_id == company_id)
        .first()
    )
    if policy is None:
        return None
    return {
        "xml_required_mode":              policy.xml_required_mode,
        "pdf_pair_required_for_cfdi":     bool(policy.pdf_pair_required_for_cfdi),
        "international_expenses_allowed": bool(policy.international_expenses_allowed),
        "tickets_allowed":                bool(policy.tickets_allowed),
        "require_justification":          bool(policy.require_justification),
        "require_proof":                  bool(policy.require_proof),
        "allow_split_allocations":        bool(policy.allow_split_allocations),
        "allocation_dimensions":          policy.allocation_dimensions,
        "allow_document_free_expenses":   bool(policy.allow_document_free_expenses),
    }
