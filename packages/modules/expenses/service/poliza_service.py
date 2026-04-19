from sqlalchemy.orm import Session

from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.poliza import Poliza
from packages.modules.expenses.models.report import ExpenseReport


def generate_poliza_for_report(db: Session, report_id: int) -> Poliza | None:
    report = db.query(ExpenseReport).filter(ExpenseReport.id == report_id).first()

    if not report:
        return None

    if report.status != "approved":
        raise ValueError("Only approved reports can generate poliza")

    expenses = db.query(Expense).filter(Expense.report_id == report.id).all()

    lines = [
        "Póliza draft\n",
        f"Report: {report.title}\n",
        f"Expenses: {len(expenses)}\n",
    ]
    for expense in expenses:
        category = expense.detected_category if expense.detected_category is not None else "uncategorized"
        lines.append(f"- {expense.description}: {expense.amount} ({category})")

    content_text = "".join(lines)

    poliza = Poliza(
        report_id=report.id,
        company_id=report.company_id,
        content_text=content_text,
    )
    db.add(poliza)
    db.commit()
    db.refresh(poliza)
    return poliza


def list_polizas(db: Session, company_id: int | None = None) -> list[Poliza]:
    query = db.query(Poliza)

    if company_id is not None:
        query = query.filter(Poliza.company_id == company_id)

    return query.all()


def get_poliza(db: Session, poliza_id: int) -> Poliza | None:
    return db.query(Poliza).filter(Poliza.id == poliza_id).first()


POLIZA_VALID_TRANSITIONS = {
    "draft": ["approved", "rejected"],
    "approved": [],
    "rejected": [],
}


def _change_poliza_status(db: Session, poliza_id: int, new_status: str) -> Poliza | None:
    poliza = db.query(Poliza).filter(Poliza.id == poliza_id).first()

    if not poliza:
        return None

    allowed = POLIZA_VALID_TRANSITIONS.get(poliza.status, [])

    if new_status not in allowed:
        raise ValueError("Invalid poliza status transition")

    poliza.status = new_status
    db.commit()
    db.refresh(poliza)
    return poliza


def approve_poliza(db: Session, poliza_id: int) -> Poliza | None:
    return _change_poliza_status(db, poliza_id, "approved")


def reject_poliza(db: Session, poliza_id: int) -> Poliza | None:
    return _change_poliza_status(db, poliza_id, "rejected")


def get_poliza_by_report(db: Session, report_id: int) -> Poliza | None:
    return db.query(Poliza).filter(Poliza.report_id == report_id).first()


def get_poliza_summary(db: Session, company_id: int | None = None) -> dict:
    query = db.query(Poliza)

    if company_id is not None:
        query = query.filter(Poliza.company_id == company_id)

    polizas = query.all()

    return {
        "total": len(polizas),
        "draft": len([p for p in polizas if p.status == "draft"]),
        "approved": len([p for p in polizas if p.status == "approved"]),
        "rejected": len([p for p in polizas if p.status == "rejected"]),
    }
