"""
test_critical_paths.py — Minimum test suite covering the 5 most critical paths.

1. Unauthenticated requests to protected endpoints return 401.
2. Cross-company expense read returns 403.
3. Expense submit via review-actions records audit with actor_user_id.
4. Document intake stores amount as Decimal (not float) and runs backfill.
5. SAT heuristic fallback fires when CFDI fields are missing.
"""

from decimal import Decimal


# ── Test 1: Protected endpoints require auth ────────────────────────────────

def test_get_expenses_requires_auth(client):
    """GET /expenses/ returns 401 when no X-User-Id header is provided."""
    resp = client.get("/expenses/")
    assert resp.status_code == 401, f"Expected 401, got {resp.status_code}: {resp.text}"


def test_review_actions_requires_auth(client, db_session, test_company):
    """POST /expenses/review-actions/{id}/submit returns 401 without auth."""
    from packages.modules.expenses.models.expense import Expense

    expense = Expense(
        company_id=test_company.id,
        description="Test",
        amount=Decimal("100.00"),
        status="draft",
    )
    db_session.add(expense)
    db_session.commit()
    db_session.refresh(expense)

    resp = client.post(f"/expenses/review-actions/{expense.id}/submit")
    assert resp.status_code == 401


# ── Test 2: Cross-company expense read returns 404 ──────────────────────────

def test_cross_company_expense_read_forbidden(client, db_session, test_company, test_user):
    """A user cannot read an expense belonging to a different company.

    Returns 404 (not 403) so the API doesn't leak the existence of another
    company's row — id-probe attacks would otherwise distinguish 'exists in
    another tenant' from 'does not exist'.
    """
    from packages.core.platform.models import Company
    from packages.modules.expenses.models.expense import Expense

    other_company = Company(name="Other Co", slug="other-co")
    db_session.add(other_company)
    db_session.commit()
    db_session.refresh(other_company)

    expense = Expense(
        company_id=other_company.id,
        description="Foreign expense",
        amount=Decimal("50.00"),
        status="draft",
    )
    db_session.add(expense)
    db_session.commit()
    db_session.refresh(expense)

    resp = client.get(
        f"/expenses/{expense.id}",
        headers={"X-User-Id": str(test_user.id)},
    )
    assert resp.status_code == 404, f"Expected 404, got {resp.status_code}: {resp.text}"


# ── Test 3: Audit actor_user_id is recorded on transition ──────────────────

def test_submit_records_audit_actor(db_session, test_company, test_user):
    """Submitting an expense via the service records actor_user_id in audit_logs."""
    from packages.core.platform.models_audit import AuditLog
    from packages.modules.expenses.models.expense import Expense
    from packages.core.platform.models_approval_setup import ApprovalSetup
    from packages.modules.expenses.service.transition_service import submit_expense

    # Seed required setup rows (transition_service reads both)
    db_session.add(ApprovalSetup(
        company_id=test_company.id,
        approval_mode="none",
        allow_resubmission_after_rejection=True,
    ))
    db_session.commit()

    expense = Expense(
        company_id=test_company.id,
        description="Audit test expense",
        amount=Decimal("200.00"),
        status="draft",
    )
    db_session.add(expense)
    db_session.commit()
    db_session.refresh(expense)

    result = submit_expense(db_session, expense, actor_user_id=test_user.id)

    assert result.status == "submitted", f"Expected submitted, got {result.status}"

    log = (
        db_session.query(AuditLog)
        .filter(
            AuditLog.entity_type == "expense",
            AuditLog.entity_id == expense.id,
            AuditLog.action == "status_change",
        )
        .order_by(AuditLog.id.desc())
        .first()
    )
    assert log is not None, "No audit log entry found for status_change"
    assert log.actor_user_id == test_user.id, (
        f"Expected actor_user_id={test_user.id}, got {log.actor_user_id}"
    )


# ── Test 4: Document intake creates expense with Decimal amount ─────────────

def test_document_create_uses_decimal_amount(db_session, test_company, test_user):
    """create_document auto-creates a draft expense with amount=Decimal('0')."""
    from packages.modules.expenses.schemas.document import ExpenseDocumentCreate
    from packages.modules.expenses.service.document_service import create_document
    from packages.modules.expenses.models.expense import Expense

    payload = ExpenseDocumentCreate(
        company_id=test_company.id,
        filename="factura_test.xml",
        content_text="plain text document",
        expense_id=None,
    )
    doc = create_document(db_session, payload)

    assert doc.id is not None
    assert doc.expense_id is not None

    expense = db_session.query(Expense).filter(Expense.id == doc.expense_id).first()
    assert expense is not None
    assert isinstance(expense.amount, Decimal), (
        f"Expected Decimal, got {type(expense.amount)}"
    )


# ── Test 5: SAT validation heuristic fallback ────────────────────────────────

def test_sat_validation_heuristic_fallback():
    """run_sat_validation falls back to heuristic when CFDI fields are missing."""
    from packages.modules.expenses.service.sat_validation_service import run_sat_validation

    result = run_sat_validation("This is a plain text document with no XML content.")

    assert "sat_status" in result
    assert "source" in result
    # Without CFDI fields, the heuristic is used — source must NOT be "sat_cfdi"
    assert result["source"] == "sat_heuristic", (
        f"Expected sat_heuristic source, got {result['source']!r}"
    )
    assert result.get("sat_service_attempted") is False


def test_sat_validation_cfdi_fields_attempt_real_sat():
    """run_sat_validation attempts the real SAT service when all CFDI fields are present."""
    from packages.modules.expenses.service.sat_validation_service import run_sat_validation

    # Provide a realistic-looking CFDI XML stub so extract_xml_fields can find the fields.
    cfdi_stub = """<?xml version="1.0"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
    Version="4.0"
    Fecha="2024-01-15T10:00:00"
    Total="1000.00"
    Folio="ABC123">
  <cfdi:Emisor Rfc="EKU9003173C9" Nombre="Emisor Test"/>
  <cfdi:Receptor Rfc="IIA040805DZ4" Nombre="Receptor Test"/>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      UUID="6128396F-CF45-3B58-967F-B93A815BCFCE"/>
  </cfdi:Complemento>
</cfdi:Comprobante>"""

    result = run_sat_validation(cfdi_stub)

    assert "sat_status" in result
    # The real SAT service will either succeed or return "unavailable" in CI.
    # We only verify that a real attempt was made (sat_service_attempted=True)
    # OR the source is "sat_cfdi" (if SAT returned a real result).
    attempted = result.get("sat_service_attempted")
    source = result.get("source", "")
    assert source == "sat_cfdi" or attempted is True, (
        f"Expected real SAT attempt; got source={source!r}, sat_service_attempted={attempted!r}"
    )
