"""Unified policy-check enumeration for the employee Validations tab.

Produces a structured list of every validation/policy rule that currently
applies to *expense*, plus its live pass/fail/warning status.  The list is
driven by admin configuration so nothing has to be hardcoded on the frontend:

  - Expense-policy toggles  (ExpensePolicy row)
  - AI policies             (AIPolicy rows, enabled=True)
  - Per-document validators (ValidationResult rows, latest-by-code)

Each row has the shape::

    {
      "group":   "document" | "sat" | "policy" | "ai",
      "code":    str,
      "label":   str,  # es-MX, admin-visible
      "status":  "passed" | "failed" | "warning" | "pending" | "not_applicable",
      "message": str,  # short explanation when not passed; empty otherwise
      "source":  "validator" | "expense_policy" | "ai_policy",
    }

This endpoint deliberately does NOT include any rule the admin has not
configured, so Spanish UX reads:  "lo que el admin configuró, y su estado."
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from packages.core.platform.models_ai_policy import AIPolicy
from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.expense_attachment import ExpenseAttachment
from packages.modules.expenses.models.expense_policy_override import (
    ExpensePolicyOverride,
)
from packages.modules.expenses.models.validation_result import ValidationResult
from packages.modules.expenses.service.ai_policy_evaluator_service import (
    _CfdiContext,
    _expense_field,
    evaluate_policies,
)
from packages.modules.expenses.service.policy_service import (
    get_or_create_company_expense_policy,
)


# ── Groups ────────────────────────────────────────────────────────────────────
# Codes from per-document validators:
DOCUMENT_CODES = {"XML_FORMAT", "UUID_PRESENT", "PDF_PAIRED", "DUPLICATE_UUID"}
SAT_CODES = {"SAT_VALIDATION", "EFOS_CHECK"}


def _latest_validation_results(db: Session, expense_id: int) -> list[ValidationResult]:
    doc_ids = [
        row[0]
        for row in db.query(ExpenseDocument.id)
        .filter(ExpenseDocument.expense_id == expense_id)
        .all()
    ]
    if not doc_ids:
        return []
    rows = (
        db.query(ValidationResult)
        .filter(ValidationResult.document_id.in_(doc_ids))
        .order_by(ValidationResult.created_at.desc())
        .all()
    )
    latest: dict[str, ValidationResult] = {}
    for r in rows:
        if r.rule_code not in latest:
            latest[r.rule_code] = r
    return list(latest.values())


def _has_attachment(db: Session, expense_id: int, attachment_type: str) -> bool:
    return (
        db.query(ExpenseAttachment.id)
        .filter(
            ExpenseAttachment.expense_id == expense_id,
            ExpenseAttachment.attachment_type == attachment_type,
        )
        .first()
        is not None
    )


def _doc_types(db: Session, expense_id: int) -> set[str]:
    rows = (
        db.query(ExpenseDocument.document_type)
        .filter(ExpenseDocument.expense_id == expense_id)
        .all()
    )
    return {(r[0] or "").lower() for r in rows}


def compute_policy_checks(db: Session, expense: Expense) -> list[dict]:
    rows: list[dict] = []

    # Load every active override once, keyed by rule_code.
    overrides: dict[str, str] = {
        r.rule_code: r.justification_note
        for r in db.query(ExpensePolicyOverride)
        .filter(ExpensePolicyOverride.expense_id == expense.id)
        .all()
    }

    def _apply_override(row: dict) -> dict:
        """If an override exists for this rule, downgrade status to passed and
        attach justification metadata.  Rows that are already passed or
        not_applicable are left untouched.
        """
        if row["status"] in ("passed", "not_applicable", "pending"):
            return row
        note = overrides.get(row["code"])
        if not note:
            row["overridden"] = False
            row["justification_note"] = None
            return row
        row["status"] = "passed"
        row["overridden"] = True
        row["justification_note"] = note
        # Preserve the original message under a separate key so the UI can
        # still show "why did this fail" alongside the justification.
        row["original_message"] = row["message"]
        row["message"] = f"Justificado: {note}"
        return row

    # ── 1. Document & SAT validators (per-document, latest-per-code) ──────────
    results = _latest_validation_results(db, expense.id)
    seen_codes: set[str] = set()
    for v in results:
        if v.rule_code in seen_codes:
            continue
        seen_codes.add(v.rule_code)
        if v.rule_code in SAT_CODES:
            group = "sat"
        elif v.rule_code in DOCUMENT_CODES:
            group = "document"
        else:
            # Legacy per-document policy rules (MISSING_PDF, POLICY_CHECK,
            # AMOUNT_MATCH, DATE_RANGE, etc.) fall into the policy bucket.
            group = "policy"

        # Deduplicate MISSING_PDF when PDF_PAIRED already passed — the two
        # describe the same rule from opposite angles and only the positive
        # result is meaningful to the employee.
        if v.rule_code == "MISSING_PDF" and any(
            r.rule_code == "PDF_PAIRED" and r.status == "passed" for r in results
        ):
            continue

        rows.append(
            {
                "group": group,
                "code": v.rule_code,
                "label": v.rule_code,  # frontend maps via ruleLabel()
                "status": v.status,
                "message": v.message or "",
                "source": "validator",
            }
        )

    # ── 2. Expense-policy toggles ────────────────────────────────────────────
    policy = get_or_create_company_expense_policy(db, expense.company_id)
    doc_types = _doc_types(db, expense.id)

    xml_mode = (policy.xml_required_mode or "").lower()
    # Multi-currency: international expenses (non-MXN) don't require CFDI XML
    expense_currency = getattr(expense, "currency", "MXN") or "MXN"
    is_international = expense_currency != "MXN"

    if is_international:
        # International expenses never require CFDI XML (foreign vendors don't issue CFDI)
        rows.append(
            {
                "group": "policy",
                "code": "XML_REQUIRED",
                "label": "CFDI XML requerido",
                "status": "not_applicable",
                "message": "Gasto internacional — CFDI XML no requerido.",
                "source": "expense_policy",
            }
        )
    elif xml_mode in ("always", "mxn_only"):
        has_xml = "cfdi_xml" in doc_types
        rows.append(
            {
                "group": "policy",
                "code": "XML_REQUIRED",
                "label": "CFDI XML requerido",
                "status": "passed" if has_xml else "failed",
                "message": "" if has_xml else "Falta el CFDI XML.",
                "source": "expense_policy",
            }
        )

    if policy.pdf_pair_required_for_cfdi:
        has_xml = "cfdi_xml" in doc_types
        has_pair = any(dt in {"cfdi_pdf", "pdf_unclassified"} for dt in doc_types)
        if has_xml:
            rows.append(
                {
                    "group": "policy",
                    "code": "PDF_PAIR_REQUIRED",
                    "label": "PDF pareado con CFDI",
                    "status": "passed" if has_pair else "failed",
                    "message": ""
                    if has_pair
                    else "Falta el PDF pareado del CFDI.",
                    "source": "expense_policy",
                }
            )
        else:
            rows.append(
                {
                    "group": "policy",
                    "code": "PDF_PAIR_REQUIRED",
                    "label": "PDF pareado con CFDI",
                    "status": "not_applicable",
                    "message": "",
                    "source": "expense_policy",
                }
            )

    if policy.require_proof:
        has_proof = _has_attachment(db, expense.id, "proof")
        rows.append(
            {
                "group": "policy",
                "code": "PROOF_REQUIRED",
                "label": "Comprobante adjunto",
                "status": "passed" if has_proof else "failed",
                "message": "" if has_proof else "Falta adjuntar un comprobante.",
                "source": "expense_policy",
            }
        )

    if policy.require_justification:
        # "justification" is satisfied by an uploaded attachment OR a free-text note.
        has_justif = _has_attachment(db, expense.id, "justification") or bool(
            (expense.notes or "").strip()
        )
        rows.append(
            {
                "group": "policy",
                "code": "JUSTIFICATION_REQUIRED",
                "label": "Justificación / nota aclaratoria",
                "status": "passed" if has_justif else "failed",
                "message": ""
                if has_justif
                else "Falta la justificación (adjunto o nota).",
                "source": "expense_policy",
            }
        )

    # ── 3. AI policies (one row each, evaluated individually) ─────────────────
    ai_policies = (
        db.query(AIPolicy)
        .filter(
            AIPolicy.company_id == expense.company_id,
            AIPolicy.enabled.is_(True),
            AIPolicy.scope == "expense_validation",
        )
        .order_by(AIPolicy.created_at.asc())
        .all()
    )
    cfdi = _CfdiContext(db, expense.id)
    for p in ai_policies:
        verdict = evaluate_policies(db, expense, policies=[p])
        if verdict["blockers"]:
            status = "failed"
            message = verdict["blockers"][0]
        elif verdict["warnings"]:
            status = "warning"
            message = verdict["warnings"][0]
        else:
            status = "passed"
            message = ""

        # When the policy fired, append the actual field value from the first
        # `when` clause so the employee can see *why* it failed without having
        # to open the XML.  Example:
        #   "La factura debe emitirse con UsoCFDI P01.
        #    — Valor actual: G03"
        if status in ("failed", "warning"):
            when = (p.rule_json or {}).get("when") or []
            if isinstance(when, list) and when and isinstance(when[0], dict):
                field = str(when[0].get("field", ""))
                if field:
                    try:
                        actual = _expense_field(expense, field, cfdi=cfdi)
                    except Exception:
                        actual = None
                    if actual is None:
                        actual_str = "(sin valor)"
                    elif isinstance(actual, list):
                        actual_str = ", ".join(str(x) for x in actual) or "(vacío)"
                    else:
                        actual_str = str(actual)
                    message = f"{message}  — Valor actual: {actual_str}".strip()

        rows.append(
            {
                "group": "ai",
                "code": f"AI_POLICY_{p.id}",
                "label": p.summary or f"Política IA #{p.id}",
                "status": status,
                "message": message,
                "source": "ai_policy",
            }
        )

    # ── 4. Apply employee overrides (flip failed → passed when justified) ────
    return [_apply_override(r) for r in rows]
