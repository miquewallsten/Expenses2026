"""One-off: backfill expense.description to emisor_nombre from attached CFDI XML."""
from apps.api.db import SessionLocal
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.service.xml_extraction_service import extract_xml_fields

db = SessionLocal()
updated = 0
for exp in db.query(Expense).all():
    xml_doc = (
        db.query(ExpenseDocument)
        .filter(
            ExpenseDocument.expense_id == exp.id,
            ExpenseDocument.document_type == "cfdi_xml",
        )
        .first()
    )
    if not xml_doc:
        continue
    ex = extract_xml_fields(xml_doc.content_text or "")
    emisor = (ex.get("emisor_nombre") or "").strip()
    if emisor and exp.description != emisor:
        print(f"  #{exp.id}: {exp.description[:60]!r} -> {emisor!r}")
        exp.description = emisor
        updated += 1
db.commit()
print(f"updated {updated} rows")
