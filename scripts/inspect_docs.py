from apps.api.db import SessionLocal
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.document import ExpenseDocument
db = SessionLocal()
print("=== EXPENSES ===")
for e in db.query(Expense).all():
    desc = (e.description or "")[:55]
    print(f"  #{e.id:3d} {e.status:10s} ${e.amount:>10.2f}  {desc!r}")
print("=== DOCUMENTS ===")
for d in db.query(ExpenseDocument).all():
    print(f"  doc#{d.id:3d} exp={d.expense_id} type={(d.document_type or '?'):<15s} {d.filename}")
