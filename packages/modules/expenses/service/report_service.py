from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.report import ExpenseReport
from packages.modules.expenses.schemas.report import ExpenseReportCreate


REPORT_VALID_TRANSITIONS = {
    "draft": ["submitted"],
    "submitted": ["approved", "rejected"],
    "approved": [],
    "rejected": [],
}


def _change_report_status(db: Session, report_id: int, new_status: str) -> ExpenseReport | None:
    report = db.query(ExpenseReport).filter(ExpenseReport.id == report_id).first()

    if not report:
        return None

    allowed = REPORT_VALID_TRANSITIONS.get(report.status, [])

    if new_status not in allowed:
        raise ValueError("Invalid report status transition")

    report.status = new_status
    db.commit()
    db.refresh(report)
    return report


def submit_report(db: Session, report_id: int) -> ExpenseReport | None:
    return _change_report_status(db, report_id, "submitted")


def approve_report(db: Session, report_id: int) -> ExpenseReport | None:
    return _change_report_status(db, report_id, "approved")


def reject_report(db: Session, report_id: int) -> ExpenseReport | None:
    return _change_report_status(db, report_id, "rejected")


def create_report(db: Session, payload: ExpenseReportCreate) -> ExpenseReport:
    company = db.query(Company).filter(Company.id == payload.company_id).first()

    if not company:
        raise ValueError("Company not found")

    report = ExpenseReport(
        company_id=payload.company_id,
        title=payload.title,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def list_reports(db: Session, company_id: int | None = None) -> list[ExpenseReport]:
    query = db.query(ExpenseReport)

    if company_id is not None:
        query = query.filter(ExpenseReport.company_id == company_id)

    return query.all()


def get_report(db: Session, report_id: int) -> ExpenseReport | None:
    return db.query(ExpenseReport).filter(ExpenseReport.id == report_id).first()


def add_expense_to_report(db: Session, expense_id: int, report_id: int) -> Expense | None:
    expense = db.query(Expense).filter(Expense.id == expense_id).first()

    if not expense:
        return None

    report = db.query(ExpenseReport).filter(ExpenseReport.id == report_id).first()

    if not report:
        raise ValueError("Report not found")

    if expense.status != "draft":
        raise ValueError("Only draft expenses can be added to reports")

    expense.report_id = report.id
    expense.status = "submitted"
    db.commit()
    db.refresh(expense)
    return expense


def list_report_expenses(db: Session, report_id: int) -> list[Expense]:
    return db.query(Expense).filter(Expense.report_id == report_id).all()


def get_report_summary(db: Session, company_id: int | None = None) -> dict:
    query = db.query(ExpenseReport)

    if company_id is not None:
        query = query.filter(ExpenseReport.company_id == company_id)

    reports = query.all()

    return {
        "total": len(reports),
        "draft": len([r for r in reports if r.status == "draft"]),
        "submitted": len([r for r in reports if r.status == "submitted"]),
        "approved": len([r for r in reports if r.status == "approved"]),
        "rejected": len([r for r in reports if r.status == "rejected"]),
    }
