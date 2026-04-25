"""AI policy evaluator.

Reads enabled AIPolicy rows for a company and evaluates each rule_json
against an Expense, returning blockers (severity='block') and warnings
(severity='warn') as plain message strings.

The evaluator is purely deterministic: no LLM calls happen here.  All
ambiguity is resolved at extraction time, when the LLM converts freeform
admin text into the structured rule_json.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from packages.core.platform.models_ai_policy import AIPolicy
from packages.core.platform.models_legal_entity import LegalEntity
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.service.document_identity_service import extract_xml_identity


# ── CFDI context (lazy per-expense parse) ────────────────────────────────────


class _CfdiContext:
    """Lazily parses the attached cfdi_xml document and caches its identity.

    Policies can reference ``uuid``, ``issuer_rfc``, ``receiver_rfc`` directly;
    the evaluator resolves these from the XML on demand — the parse happens at
    most once per evaluate_policies() call, only if a policy actually needs a
    CFDI field.
    """

    def __init__(self, db: Session, expense_id: int) -> None:
        self._db = db
        self._expense_id = expense_id
        self._loaded = False
        self._identity: dict[str, Any] = {}
        self._has_xml: bool | None = None

    def has_xml(self) -> bool:
        if self._has_xml is None:
            self._has_xml = (
                self._db.query(ExpenseDocument.id)
                .filter(
                    ExpenseDocument.expense_id == self._expense_id,
                    ExpenseDocument.document_type == "cfdi_xml",
                )
                .first()
                is not None
            )
        return bool(self._has_xml)

    def identity(self) -> dict[str, Any]:
        if self._loaded:
            return self._identity
        self._loaded = True
        row = (
            self._db.query(ExpenseDocument)
            .filter(
                ExpenseDocument.expense_id == self._expense_id,
                ExpenseDocument.document_type == "cfdi_xml",
            )
            .first()
        )
        if row is None:
            self._has_xml = False
            return self._identity
        self._has_xml = True
        try:
            self._identity = extract_xml_identity(row.filename or "", row.content_text or "")
        except Exception:
            self._identity = {}
        return self._identity


# ── Field accessor ────────────────────────────────────────────────────────────


def _expense_field(expense: Expense, field: str, *, cfdi: _CfdiContext) -> Any:
    """Resolve `field` against an Expense row.  Returns None if unknown."""
    if field == "amount":
        amt = getattr(expense, "amount", None)
        if amt is None:
            return None
        try:
            return float(amt) if isinstance(amt, Decimal) else float(amt)
        except (TypeError, ValueError):
            return None
    if field == "currency":
        return (getattr(expense, "currency", "") or "").upper() or None
    if field == "category":
        return (getattr(expense, "category_code", "") or "").strip().lower() or None
    if field == "supplier_name":
        return (getattr(expense, "supplier_name", "") or "").strip()
    if field == "has_xml":
        return cfdi.has_xml()
    if field in ("uuid", "issuer_rfc", "receiver_rfc"):
        val = cfdi.identity().get(field)
        return str(val).strip().upper() if val else None
    if field in ("uso_cfdi", "tipo_comprobante"):
        val = cfdi.identity().get(field)
        return str(val).strip().upper() if val else None
    if field in ("forma_pago", "metodo_pago"):
        val = cfdi.identity().get(field)
        return str(val).strip() if val else None
    if field in ("issuer_zip", "receiver_zip"):
        val = cfdi.identity().get(field)
        return str(val).strip() if val else None
    if field in ("issuer_regimen", "receiver_regimen"):
        val = cfdi.identity().get(field)
        return str(val).strip() if val else None
    if field == "is_international":
        cur = (getattr(expense, "currency", "") or "").upper()
        if cur and cur not in ("MXN", ""):
            return True
        # Fallback to explicit flag if the column exists.
        return bool(getattr(expense, "is_international", False))
    if field == "expense_type":
        return (getattr(expense, "expense_type", "") or "").strip().lower() or None
    if field == "payment_method":
        return (getattr(expense, "payment_method", "") or "").strip().lower() or None
    if field == "description":
        return (getattr(expense, "description", "") or "").strip()
    if field == "notes":
        return (getattr(expense, "notes", "") or "").strip()
    if field == "has_notes":
        return bool((getattr(expense, "notes", "") or "").strip())
    if field in ("expense_date", "expense_year"):
        ed = getattr(expense, "expense_date", None)
        # Prefer Expense.expense_date (already backfilled from CFDI Fecha);
        # fall back to re-parsing the XML identity for robustness.
        if ed is None:
            raw = cfdi.identity().get("document_date")
            if isinstance(raw, str) and raw:
                try:
                    ed = date.fromisoformat(raw[:10])
                except ValueError:
                    ed = None
        if isinstance(ed, datetime):
            ed = ed.date()
        if not isinstance(ed, date):
            return None
        return ed.isoformat() if field == "expense_date" else ed.year
    return None


def _resolve_dynamic(
    value: Any,
    *,
    company_rfcs: list[str] | None = None,
    reimbursement_rfcs: list[str] | None = None,
    invoice_zips: list[str] | None = None,
    reimbursement_zips: list[str] | None = None,
    invoice_regimes: list[str] | None = None,
) -> Any:
    """Expand dynamic value tokens at evaluation time.

    Date tokens resolve to ISO strings / integers. Entity-list tokens all
    resolve against `legal_entities` filtered by `is_active=True` plus the
    relevant operational flag:
      $legal_entity_rfcs / $legal_entity_zips / $legal_entity_regimes
        → is_invoice_receiver_entity=True
      $reimbursement_entity_rfcs / $reimbursement_entity_zips
        → is_reimbursement_entity=True
    """
    today = date.today()
    tokens: dict[str, Any] = {
        "$current_date":                 today.isoformat(),
        "$current_year":                 today.year,
        "$current_year_start":           date(today.year, 1, 1).isoformat(),
        "$current_year_end":             date(today.year, 12, 31).isoformat(),
        "$current_month_start":          date(today.year, today.month, 1).isoformat(),
        "$legal_entity_rfcs":            list(company_rfcs or []),
        "$reimbursement_entity_rfcs":    list(reimbursement_rfcs or []),
        "$legal_entity_zips":            list(invoice_zips or []),
        "$reimbursement_entity_zips":    list(reimbursement_zips or []),
        "$legal_entity_regimes":         list(invoice_regimes or []),
    }
    if isinstance(value, str) and value in tokens:
        return tokens[value]
    if isinstance(value, list):
        return [tokens.get(v, v) if isinstance(v, str) else v for v in value]
    return value


# ── Operator implementations ──────────────────────────────────────────────────


def _coerce_pair(field_value: Any, value: Any) -> tuple[Any, Any]:
    """Best-effort numeric/boolean coercion so '5000' compares with 5000 and
    'false' compares with False.
    """
    # Booleans first — "false"/"true" strings should compare against bool fields.
    if isinstance(field_value, bool) and isinstance(value, str):
        low = value.strip().lower()
        if low in ("true", "false"):
            return field_value, (low == "true")
    if isinstance(value, bool) and isinstance(field_value, str):
        low = field_value.strip().lower()
        if low in ("true", "false"):
            return (low == "true"), value
    if isinstance(field_value, (int, float)) and isinstance(value, str):
        try:
            return field_value, float(value)
        except ValueError:
            return field_value, value
    if isinstance(value, (int, float)) and isinstance(field_value, str):
        try:
            return float(field_value), value
        except ValueError:
            return field_value, value
    return field_value, value


def _eval_op(op: str, field_value: Any, value: Any) -> bool:
    if field_value is None:
        # `not_in` is the only op that should be true on a missing value
        # (the value is trivially "not in" a set).  All others fail safely.
        return op == "not_in"

    fv, val = _coerce_pair(field_value, value)

    try:
        if op == "=":  return fv == val
        if op == "!=": return fv != val
        if op == ">":  return fv >  val  # type: ignore[operator]
        if op == ">=": return fv >= val  # type: ignore[operator]
        if op == "<":  return fv <  val  # type: ignore[operator]
        if op == "<=": return fv <= val  # type: ignore[operator]
        if op == "in":
            if not isinstance(val, list):
                return False
            return fv in val
        if op == "not_in":
            if not isinstance(val, list):
                return True
            return fv not in val
        if op == "contains":
            if not isinstance(fv, str) or not isinstance(val, str):
                return False
            return val.lower() in fv.lower()
    except TypeError:
        return False
    return False


# ── Evaluator ─────────────────────────────────────────────────────────────────


def evaluate_policies(
    db: Session,
    expense: Expense,
    policies: list[AIPolicy] | None = None,
) -> dict[str, list[str]]:
    """Evaluate every enabled AIPolicy for *expense*'s company.

    Returns: { 'blockers': [str, ...], 'warnings': [str, ...] }.
    """
    if policies is None:
        policies = (
            db.query(AIPolicy)
            .filter(
                AIPolicy.company_id == expense.company_id,
                AIPolicy.enabled.is_(True),
                AIPolicy.scope == "expense_validation",
            )
            .all()
        )

    if not policies:
        return {"blockers": [], "warnings": []}

    cfdi = _CfdiContext(db, expense.id)
    _cache: dict[str, list[str]] = {}

    def _entity_column(column_name: str, *, uppercase: bool, **flags: Any) -> list[str]:
        col = getattr(LegalEntity, column_name)
        q = db.query(col).filter(
            LegalEntity.company_id == expense.company_id,
            LegalEntity.is_active.is_(True),
        )
        for k, v in flags.items():
            q = q.filter(getattr(LegalEntity, k).is_(v))
        out: list[str] = []
        for (raw,) in q.all():
            if not raw:
                continue
            s = str(raw).strip()
            if not s:
                continue
            out.append(s.upper() if uppercase else s)
        return out

    def _cached(key: str, loader: Any) -> list[str]:
        if key not in _cache:
            _cache[key] = loader()
        return _cache[key]

    def _invoice_rfcs() -> list[str]:
        return _cached("inv_rfc", lambda: _entity_column(
            "rfc", uppercase=True, is_invoice_receiver_entity=True))

    def _reimb_rfcs() -> list[str]:
        return _cached("reimb_rfc", lambda: _entity_column(
            "rfc", uppercase=True, is_reimbursement_entity=True))

    def _invoice_zips() -> list[str]:
        return _cached("inv_zip", lambda: _entity_column(
            "fiscal_zip_code", uppercase=False, is_invoice_receiver_entity=True))

    def _reimb_zips() -> list[str]:
        return _cached("reimb_zip", lambda: _entity_column(
            "fiscal_zip_code", uppercase=False, is_reimbursement_entity=True))

    def _invoice_regimes() -> list[str]:
        return _cached("inv_reg", lambda: _entity_column(
            "fiscal_regime", uppercase=False, is_invoice_receiver_entity=True))

    blockers: list[str] = []
    warnings: list[str] = []

    for policy in policies:
        rule = policy.rule_json or {}
        when = rule.get("when") or []
        then = rule.get("then") or {}
        if not isinstance(when, list) or not when or not isinstance(then, dict):
            continue

        # All `when` clauses must match (AND).
        all_match = True
        for clause in when:
            if not isinstance(clause, dict):
                all_match = False
                break
            field = str(clause.get("field", ""))
            op    = str(clause.get("op", ""))
            raw_value = clause.get("value")
            # Resolve list-tokens lazily — only query the DB when the rule needs them.
            def _has_token(tok: str) -> bool:
                return raw_value == tok or (
                    isinstance(raw_value, list) and tok in raw_value
                )
            value = _resolve_dynamic(
                raw_value,
                company_rfcs=_invoice_rfcs() if _has_token("$legal_entity_rfcs") else None,
                reimbursement_rfcs=_reimb_rfcs() if _has_token("$reimbursement_entity_rfcs") else None,
                invoice_zips=_invoice_zips() if _has_token("$legal_entity_zips") else None,
                reimbursement_zips=_reimb_zips() if _has_token("$reimbursement_entity_zips") else None,
                invoice_regimes=_invoice_regimes() if _has_token("$legal_entity_regimes") else None,
            )
            field_value = _expense_field(expense, field, cfdi=cfdi)
            if not _eval_op(op, field_value, value):
                all_match = False
                break
        if not all_match:
            continue

        message = str(then.get("message", "")).strip() or policy.summary
        action  = str(then.get("action", policy.severity or "warn")).lower()
        if action == "block":
            blockers.append(message)
        else:
            warnings.append(message)

    return {"blockers": blockers, "warnings": warnings}
