"""Phase 8.2 follow-up — extracted_fields surfaces on ExpenseDocumentRead."""
from packages.core.platform.models_user import User
from packages.modules.expenses.models.document import ExpenseDocument


def test_get_document_returns_extracted_fields(db_session, client, test_company):
    user = User(
        full_name="Reader",
        email="ocr-read@t.test",
        role="employee",
        company_id=test_company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    doc = ExpenseDocument(
        company_id=test_company.id,
        filename="receipt.png",
        content_text="OXXO TIENDA #123\nTotal: 154.20\nFecha: 2026-04-15",
        document_type="ticket",
        extracted_fields={
            "merchant": "OXXO TIENDA #123",
            "total": "154.20",
            "date": "2026-04-15",
            "rfc": "ABC010101AAA",
        },
    )
    db_session.add(doc)
    db_session.commit()
    db_session.refresh(doc)

    r = client.get(
        f"/expenses/documents/{doc.id}",
        headers={"X-User-Id": str(user.id)},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["extracted_fields"] == {
        "merchant": "OXXO TIENDA #123",
        "total": "154.20",
        "date": "2026-04-15",
        "rfc": "ABC010101AAA",
    }


def test_get_document_extracted_fields_null_when_absent(db_session, client, test_company):
    user = User(
        full_name="Reader2",
        email="ocr-read2@t.test",
        role="employee",
        company_id=test_company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    doc = ExpenseDocument(
        company_id=test_company.id,
        filename="r2.pdf",
        content_text="x",
        document_type="ticket",
    )
    db_session.add(doc)
    db_session.commit()
    db_session.refresh(doc)

    r = client.get(
        f"/expenses/documents/{doc.id}",
        headers={"X-User-Id": str(user.id)},
    )
    assert r.status_code == 200, r.text
    assert r.json()["extracted_fields"] is None


def test_create_document_runs_ocr_extraction(db_session, test_company):
    """Phase 8.2 hookup — create_document should run extract_fields and persist."""
    from packages.modules.expenses.service.document_service import create_document
    from packages.modules.expenses.schemas.document import ExpenseDocumentCreate

    payload = ExpenseDocumentCreate(
        company_id=test_company.id,
        filename="receipt.txt",
        content_text=(
            "OXXO TIENDA #45\n"
            "Total: 99.50\n"
            "Fecha: 2026-04-15\n"
            "RFC: ABC010101AAA\n"
        ),
    )
    doc = create_document(db_session, payload)
    assert doc.extracted_fields is not None
    assert doc.extracted_fields.get("total") == "99.50"
    assert doc.extracted_fields.get("date") == "2026-04-15"
    assert doc.extracted_fields.get("rfc") == "ABC010101AAA"
    assert doc.extraction_status == "completed"


def test_create_document_skips_ocr_for_cfdi_xml(db_session, test_company):
    """CFDI XML has its own canonical parser — heuristic OCR must skip."""
    from packages.modules.expenses.service.document_service import create_document
    from packages.modules.expenses.schemas.document import ExpenseDocumentCreate

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Total="500.00">'
        '</cfdi:Comprobante>'
    )
    payload = ExpenseDocumentCreate(
        company_id=test_company.id,
        filename="cfdi.xml",
        content_text=xml,
    )
    doc = create_document(db_session, payload)
    assert doc.document_type == "cfdi_xml"
    # OCR heuristic skipped for cfdi_xml — only classifier may be present.
    ef = doc.extracted_fields or {}
    assert "total" not in ef
    assert "merchant" not in ef
    assert "rfc" not in ef


def test_create_document_prefills_draft_expense_from_ocr(db_session, test_company):
    """Phase 8.2 follow-up — auto-created draft Expense inherits OCR amount + date."""
    from datetime import date
    from decimal import Decimal

    from packages.modules.expenses.service.document_service import create_document
    from packages.modules.expenses.schemas.document import ExpenseDocumentCreate
    from packages.modules.expenses.models.expense import Expense

    payload = ExpenseDocumentCreate(
        company_id=test_company.id,
        filename="ocr-prefill-uniq-83729.txt",
        content_text=(
            "STARBUCKS POLANCO\n"
            "Total: 87.40\n"
            "Fecha: 2026-04-22\n"
        ),
    )
    doc = create_document(db_session, payload)
    assert doc.expense_id is not None

    exp = db_session.query(Expense).filter(Expense.id == doc.expense_id).first()
    assert exp is not None
    assert exp.amount == Decimal("87.40")
    assert exp.expense_date == date(2026, 4, 22)
    assert exp.status == "draft"


def test_create_document_draft_falls_back_when_ocr_empty(db_session, test_company):
    """No OCR signal → draft Expense still gets created with amount=0, date=None."""
    from decimal import Decimal

    from packages.modules.expenses.service.document_service import create_document
    from packages.modules.expenses.schemas.document import ExpenseDocumentCreate
    from packages.modules.expenses.models.expense import Expense

    payload = ExpenseDocumentCreate(
        company_id=test_company.id,
        filename="ocr-empty-blob-uniq-83730.txt",
        content_text="",
    )
    doc = create_document(db_session, payload)
    assert doc.expense_id is not None
    exp = db_session.query(Expense).filter(Expense.id == doc.expense_id).first()
    assert exp.amount == Decimal("0")
    assert exp.expense_date is None


def test_create_document_stamps_classifier_on_extracted_fields(db_session, test_company):
    """Phase 8.11 follow-up — classifier label/confidence/method stored under extracted_fields['classifier']."""
    from packages.modules.expenses.service.document_service import create_document
    from packages.modules.expenses.schemas.document import ExpenseDocumentCreate

    payload = ExpenseDocumentCreate(
        company_id=test_company.id,
        filename="ticket-classifier-uniq-1.txt",
        content_text="OXXO TIENDA #99\nGracias por su compra\nTotal: 42.50\n",
    )
    doc = create_document(db_session, payload)
    assert doc.extracted_fields is not None
    cls = doc.extracted_fields.get("classifier")
    assert cls is not None
    assert cls.get("label") in {"receipt", "invoice", "cfdi_xml", "statement", "other"}
    assert isinstance(cls.get("confidence"), float)
    assert cls.get("method") in {"rule", "knn", "default"}


def test_create_document_classifier_recognises_ticket(db_session, test_company):
    """Strong receipt rule signal should classify as 'receipt' with rule method."""
    from packages.modules.expenses.service.document_service import create_document
    from packages.modules.expenses.schemas.document import ExpenseDocumentCreate

    payload = ExpenseDocumentCreate(
        company_id=test_company.id,
        filename="ticket-rule-uniq-2.txt",
        content_text=(
            "7-ELEVEN MEXICO\n"
            "Ticket de venta\n"
            "Gracias por su compra\n"
            "Total: 58.00\n"
        ),
    )
    doc = create_document(db_session, payload)
    cls = (doc.extracted_fields or {}).get("classifier")
    assert cls is not None
    assert cls["label"] == "receipt"
    assert cls["method"] == "rule"
    assert cls["confidence"] >= 0.5
