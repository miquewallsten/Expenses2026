from sqlalchemy.orm import Session

from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.models.validation_result import ValidationResult
from packages.modules.expenses.service.sat_validation_service import run_sat_validation
from packages.modules.expenses.service.document_matching_service import find_best_pdf_match_for_xml
from packages.modules.expenses.service.policy_service import get_or_create_company_expense_policy


def run_validation_pipeline(
    db: Session,
    document: ExpenseDocument,
    extracted: dict,
    settings: dict | None = None,
) -> list[ValidationResult]:
    """
    Run all validation rules against a document and its extracted data.

    Returns a list of unsaved ValidationResult objects.
    The caller is responsible for committing them to the database.
    """
    results: list[ValidationResult] = []
    policy = get_or_create_company_expense_policy(db, document.company_id)

    def _result(rule_code: str, status: str, message: str) -> ValidationResult:
        return ValidationResult(
            document_id=document.id,
            source="engine",
            rule_code=rule_code,
            status=status,
            message=message,
        )

    is_xml_declared = document.document_type == "cfdi_xml"
    is_xml_parsed   = bool(extracted.get("is_xml"))

    # ── A. XML structure / parse check ────────────────────────────────────────
    if is_xml_declared and not is_xml_parsed:
        # Declared as CFDI XML but failed to parse — short-circuit with failure
        results.append(_result(
            rule_code="XML_PARSE_FAILED",
            status="failed",
            message="Document was identified as XML but could not be parsed.",
        ))
        return results

    if is_xml_declared or is_xml_parsed:
        results.append(_result(
            rule_code="XML_FORMAT",
            status="passed",
            message="Document is a valid CFDI XML.",
        ))

    # ── B. UUID presence ───────────────────────────────────────────────────────
    uuid_value: str | None = extracted.get("uuid") or None
    if uuid_value:
        results.append(_result(
            rule_code="UUID_PRESENT",
            status="passed",
            message=f"UUID found: {uuid_value}",
        ))
    else:
        results.append(_result(
            rule_code="UUID_PRESENT",
            status="warning",
            message="No UUID found in extracted data.",
        ))

    # ── C. Duplicate UUID ──────────────────────────────────────────────────────
    if uuid_value:
        duplicate = (
            db.query(ExpenseDocument)
            .filter(
                ExpenseDocument.id != document.id,
                ExpenseDocument.content_text.ilike(f"%{uuid_value}%"),
            )
            .first()
        )
        if duplicate:
            results.append(_result(
                rule_code="DUPLICATE_UUID",
                status="failed",
                message=f"UUID {uuid_value} already exists in document #{duplicate.id}.",
            ))

    # ── D. SAT validation ──────────────────────────────────────────────────────
    sat = run_sat_validation(document.content_text or "")
    results.append(_result(
        rule_code="SAT_VALIDATION",
        status="passed" if sat.get("is_valid") else "warning",
        message=sat.get("message", "SAT validation completed."),
    ))

    # ── E. PDF pairing (XML only) ──────────────────────────────────────────────
    if is_xml_declared or is_xml_parsed:
        paired = find_best_pdf_match_for_xml(db, document.company_id, document.id)
        if not paired:
            results.append(_result(
                rule_code="MISSING_PDF",
                status="warning",
                message="No paired PDF found for this XML document.",
            ))

    # ── F. Receiver RFC allowlist ──────────────────────────────────────────────
    _settings = settings or {}
    allowed_rfcs_raw = _settings.get("allowed_receiver_rfcs", "")
    if allowed_rfcs_raw.strip() and is_xml_parsed:
        allowed_rfcs = [rfc.strip() for rfc in allowed_rfcs_raw.split(",") if rfc.strip()]
        receiver_rfc: str | None = extracted.get("receptor_rfc") or None
        if receiver_rfc:
            if receiver_rfc in allowed_rfcs:
                results.append(_result(
                    rule_code="RECEIVER_RFC_ALLOWED",
                    status="passed",
                    message="Receiver RFC is allowed.",
                ))
            else:
                results.append(_result(
                    rule_code="RECEIVER_RFC_NOT_ALLOWED",
                    status="failed",
                    message="Receiver RFC is not allowed for this company.",
                ))

    return results
