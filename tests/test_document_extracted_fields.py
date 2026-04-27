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
    assert doc.extracted_fields is None
