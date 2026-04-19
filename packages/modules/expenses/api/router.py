from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_manager_or_accountant, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.expenses.schemas.expense import ExpenseCreate, ExpenseRead
from packages.modules.expenses.schemas.expense_update import ExpenseUpdate
from packages.modules.expenses.service.expense_service import create_expense, delete_expense, get_expense, get_expense_summary, list_expenses, update_expense
from packages.modules.expenses.service.config_reader import get_account_mapping_config
from packages.modules.expenses.schemas.document import ExpenseDocumentCreate, ExpenseDocumentRead
from packages.modules.expenses.schemas.document_update import ExpenseDocumentUpdate
from packages.modules.expenses.schemas.validation_result import ValidationResultRead
from packages.modules.expenses.service.document_service import create_document, get_document, list_documents, list_documents_by_expense, update_document
from packages.modules.expenses.service.document_validation_service import validate_document
from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.report import ExpenseReport
from packages.modules.expenses.models.validation_result import ValidationResult
from packages.modules.expenses.models.tag import ExpenseTag
from packages.modules.expenses.schemas.report import ExpenseReportCreate, ExpenseReportRead
from packages.modules.expenses.schemas.poliza import PolizaRead
from packages.modules.expenses.service.report_service import add_expense_to_report, approve_report, create_report, get_report, get_report_summary, list_report_expenses, list_reports, reject_report, submit_report
from packages.modules.expenses.service.poliza_service import approve_poliza, generate_poliza_for_report, get_poliza, get_poliza_by_report, get_poliza_summary, list_polizas, reject_poliza
from packages.core.platform.schemas_org_units import ProjectCreate, ProjectRead, ClientCreate, ClientRead, CostCenterCreate, CostCenterRead
from packages.core.platform.service_org_units import create_project, list_projects, create_client, list_clients, create_cost_center, list_cost_centers
from packages.modules.expenses.schemas.expense_allocation import ExpenseAllocationCreate, ExpenseAllocationRead
from packages.modules.expenses.schemas.expense_attachment import ExpenseAttachmentCreate, ExpenseAttachmentRead
from packages.modules.expenses.service.allocation_service import create_expense_allocation, list_expense_allocations
from packages.modules.expenses.service.attachment_service import create_expense_attachment, list_expense_attachments
from packages.core.platform.models_accounting_category import AccountingCategory
from packages.modules.expenses.service.accounting_learning_service import find_learning_match
from packages.modules.accounting.service.accounting_explanation_service import explain_accounting_decision
from packages.modules.expenses.service.sat_validation_service import run_sat_validation
from packages.modules.expenses.service.policy_service import get_or_create_company_expense_policy

router = APIRouter(prefix="/expenses", tags=["expenses"])


@router.post("/", response_model=ExpenseRead)
def create_expense_route(payload: ExpenseCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        require_same_company(payload.company_id, current_user)
        return create_expense(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=list[ExpenseRead])
def list_expenses_route(company_id: int | None = None, status: str | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Non-admin users are scoped to their own company. Admins may pass an explicit company_id.
    if current_user.role != "admin":
        company_id = current_user.company_id
    return list_expenses(db, company_id, status)


@router.get("/summary")
def get_expense_summary_route(company_id: int | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        company_id = current_user.company_id
    return get_expense_summary(db, company_id)


@router.post("/documents", response_model=ExpenseDocumentRead)
def create_document_route(payload: ExpenseDocumentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # NOTE: This endpoint receives JSON (content_text only). No file bytes are available.
    # Binary upload path should archive the original file here.
    try:
        require_same_company(payload.company_id, current_user)
        document = create_document(db, payload)

        # Policy check: if tickets are not allowed and this doc is a ticket,
        # mark it failed without rejecting the HTTP response.
        if document.document_type == "ticket":
            policy = get_or_create_company_expense_policy(db, document.company_id)
            if not policy.tickets_allowed:
                document.validation_status = "failed"
                db.add(ValidationResult(
                    document_id=document.id,
                    source="policy",
                    rule_code="TICKET_NOT_ALLOWED",
                    status="failed",
                    message="Company policy does not allow ticket/receipt documents.",
                ))
                db.commit()
                db.refresh(document)

        return document
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/documents", response_model=list[ExpenseDocumentRead])
def list_documents_route(company_id: int | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        company_id = current_user.company_id
    return list_documents(db, company_id)


@router.get("/documents/{document_id}", response_model=ExpenseDocumentRead)
def get_document_route(document_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    document = get_document(db, document_id)

    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")

    if current_user.role != "admin" and document.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cross-company access is not allowed")

    return document


@router.delete("/documents/{document_id}", status_code=204)
def delete_document_route(document_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    document = get_document(db, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if current_user.role != "admin" and document.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cross-company access is not allowed")
    # Delete all linked validation results first to avoid FK violations
    db.query(ValidationResult).filter(ValidationResult.document_id == document_id).delete(synchronize_session=False)
    db.delete(document)
    db.commit()


@router.patch("/documents/{document_id}", response_model=ExpenseDocumentRead)
def update_document_route(document_id: int, payload: ExpenseDocumentUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        document = get_document(db, document_id)
        if document is None:
            raise HTTPException(status_code=404, detail="Document not found")
        if current_user.role != "admin" and document.company_id != current_user.company_id:
            raise HTTPException(status_code=403, detail="Cross-company access is not allowed")
        document = update_document(db, document_id, payload)
        return document
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/documents/by-expense/{expense_id}", response_model=list[ExpenseDocumentRead])
def list_documents_by_expense_route(expense_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    docs = list_documents_by_expense(db, expense_id)
    if docs and current_user.role != "admin" and docs[0].company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cross-company access is not allowed")
    return docs


@router.post("/documents/{document_id}/validate", response_model=list[ValidationResultRead])
def validate_document_route(document_id: int, db: Session = Depends(get_db)):
    results = validate_document(db, document_id)

    if results is None:
        raise HTTPException(status_code=404, detail="Document not found")

    return results


@router.get("/documents/{document_id}/validation-results", response_model=list[ValidationResultRead])
def list_validation_results_route(document_id: int, db: Session = Depends(get_db)):
    return (
        db.query(ValidationResult)
        .filter(ValidationResult.document_id == document_id)
        .order_by(ValidationResult.id.desc())
        .all()
    )


@router.post("/reports", response_model=ExpenseReportRead)
def create_report_route(payload: ExpenseReportCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        require_same_company(payload.company_id, current_user)
        return create_report(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/reports", response_model=list[ExpenseReportRead])
def list_reports_route(company_id: int | None = None, db: Session = Depends(get_db)):
    return list_reports(db, company_id)


@router.get("/reports/summary")
def get_report_summary_route(company_id: int | None = None, db: Session = Depends(get_db)):
    return get_report_summary(db, company_id)


@router.get("/reports/{report_id}", response_model=ExpenseReportRead)
def get_report_route(report_id: int, db: Session = Depends(get_db)):
    report = get_report(db, report_id)

    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    return report


@router.post("/reports/{report_id}/expenses/{expense_id}", response_model=ExpenseRead)
def add_expense_to_report_route(report_id: int, expense_id: int, db: Session = Depends(get_db)):
    try:
        expense = add_expense_to_report(db, expense_id=expense_id, report_id=report_id)

        if expense is None:
            raise HTTPException(status_code=404, detail="Expense not found")

        return expense
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/reports/{report_id}/expenses", response_model=list[ExpenseRead])
def list_report_expenses_route(report_id: int, db: Session = Depends(get_db)):
    return list_report_expenses(db, report_id)


@router.post("/reports/{report_id}/submit", response_model=ExpenseReportRead)
def submit_report_route(report_id: int, db: Session = Depends(get_db)):
    try:
        report = submit_report(db, report_id)

        if report is None:
            raise HTTPException(status_code=404, detail="Report not found")

        return report
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/reports/{report_id}/approve", response_model=ExpenseReportRead)
def approve_report_route(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_accountant)):
    try:
        report = approve_report(db, report_id)

        if report is None:
            raise HTTPException(status_code=404, detail="Report not found")

        return report
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/reports/{report_id}/reject", response_model=ExpenseReportRead)
def reject_report_route(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_accountant)):
    try:
        report = reject_report(db, report_id)

        if report is None:
            raise HTTPException(status_code=404, detail="Report not found")

        return report
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/reports/{report_id}/generate-poliza", response_model=PolizaRead)
def generate_poliza_route(report_id: int, db: Session = Depends(get_db)):
    try:
        result = generate_poliza_for_report(db, report_id)

        if result is None:
            raise HTTPException(status_code=404, detail="Report not found")

        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/polizas", response_model=list[PolizaRead])
def list_polizas_route(company_id: int | None = None, db: Session = Depends(get_db)):
    return list_polizas(db, company_id)


@router.get("/polizas/summary")
def get_poliza_summary_route(company_id: int | None = None, db: Session = Depends(get_db)):
    return get_poliza_summary(db, company_id)


@router.get("/polizas/{poliza_id}", response_model=PolizaRead)
def get_poliza_route(poliza_id: int, db: Session = Depends(get_db)):
    poliza = get_poliza(db, poliza_id)

    if poliza is None:
        raise HTTPException(status_code=404, detail="Poliza not found")

    return poliza


@router.post("/polizas/{poliza_id}/approve", response_model=PolizaRead)
def approve_poliza_route(poliza_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_accountant)):
    try:
        poliza = approve_poliza(db, poliza_id)

        if poliza is None:
            raise HTTPException(status_code=404, detail="Poliza not found")

        return poliza
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/polizas/{poliza_id}/reject", response_model=PolizaRead)
def reject_poliza_route(poliza_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_manager_or_accountant)):
    try:
        poliza = reject_poliza(db, poliza_id)

        if poliza is None:
            raise HTTPException(status_code=404, detail="Poliza not found")

        return poliza
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/reports/{report_id}/poliza", response_model=PolizaRead)
def get_poliza_by_report_route(report_id: int, db: Session = Depends(get_db)):
    poliza = get_poliza_by_report(db, report_id)

    if poliza is None:
        raise HTTPException(status_code=404, detail="Poliza not found")

    return poliza


class SubmissionFromDocumentsPayload(BaseModel):
    company_id: int
    document_ids: list[int]


@router.post("/submissions/from-documents")
def create_submission_from_documents_route(
    payload: SubmissionFromDocumentsPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(payload.company_id, current_user)

    documents = (
        db.query(ExpenseDocument)
        .filter(ExpenseDocument.id.in_(payload.document_ids))
        .all()
    )

    found_ids = {d.id for d in documents}
    if any(doc_id not in found_ids for doc_id in payload.document_ids):
        raise HTTPException(status_code=400, detail="Only passed documents can be submitted")

    if any(
        d.company_id != payload.company_id or d.validation_status != "passed"
        for d in documents
    ):
        raise HTTPException(status_code=400, detail="Only passed documents can be submitted")

    report = ExpenseReport(
        company_id=payload.company_id,
        title="Submission",
        status="draft",
    )
    db.add(report)
    db.flush()

    for doc in documents:
        amount: Decimal = Decimal(0)
        for line in (doc.content_text or "").splitlines():
            if line.lower().startswith("total:"):
                raw = line.split(":", 1)[1].strip()
                try:
                    amount = Decimal(raw)
                except Exception:
                    pass
                break
        expense = Expense(
            company_id=payload.company_id,
            description=doc.filename,
            amount=amount,
            mapping_snapshot=None,
            detected_category=None,
            report_id=report.id,
        )
        db.add(expense)
        db.flush()
        doc.expense_id = expense.id

    db.commit()

    return {"report_id": report.id, "documents_linked": len(documents)}


# ── Projects ─────────────────────────────────────────────────────────────────

@router.post("/projects", response_model=ProjectRead)
def create_project_route(payload: ProjectCreate, db: Session = Depends(get_db)):
    return create_project(db, payload)


@router.get("/projects", response_model=list[ProjectRead])
def list_projects_route(company_id: int | None = None, db: Session = Depends(get_db)):
    return list_projects(db, company_id)


# ── Clients ───────────────────────────────────────────────────────────────────

@router.post("/clients", response_model=ClientRead)
def create_client_route(payload: ClientCreate, db: Session = Depends(get_db)):
    return create_client(db, payload)


@router.get("/clients", response_model=list[ClientRead])
def list_clients_route(company_id: int | None = None, db: Session = Depends(get_db)):
    return list_clients(db, company_id)


# ── Cost Centers ──────────────────────────────────────────────────────────────

@router.post("/cost-centers", response_model=CostCenterRead)
def create_cost_center_route(payload: CostCenterCreate, db: Session = Depends(get_db)):
    return create_cost_center(db, payload)


@router.get("/cost-centers", response_model=list[CostCenterRead])
def list_cost_centers_route(company_id: int | None = None, db: Session = Depends(get_db)):
    return list_cost_centers(db, company_id)


# ── Allocations ───────────────────────────────────────────────────────────────

@router.post("/allocations", response_model=ExpenseAllocationRead)
def create_allocation_route(payload: ExpenseAllocationCreate, db: Session = Depends(get_db)):
    return create_expense_allocation(db, payload)


@router.get("/allocations/{expense_id}", response_model=list[ExpenseAllocationRead])
def list_allocations_route(expense_id: int, db: Session = Depends(get_db)):
    return list_expense_allocations(db, expense_id)


# ── Attachments ───────────────────────────────────────────────────────────────

@router.post("/attachments", response_model=ExpenseAttachmentRead)
def create_attachment_route(payload: ExpenseAttachmentCreate, db: Session = Depends(get_db)):
    return create_expense_attachment(db, payload)


@router.get("/attachments/{expense_id}", response_model=list[ExpenseAttachmentRead])
def list_attachments_route(expense_id: int, db: Session = Depends(get_db)):
    return list_expense_attachments(db, expense_id)


# ── SAT Validation ────────────────────────────────────────────────────────────

class SatValidationPayload(BaseModel):
    content_text: str


@router.post("/validate-sat")
def validate_sat_route(payload: SatValidationPayload):
    return run_sat_validation(payload.content_text)


# ── Expense by ID ─────────────────────────────────────────────────────────────

@router.get("/{expense_id}", response_model=ExpenseRead)
def get_expense_route(expense_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    expense = get_expense(db, expense_id)

    if expense is None:
        raise HTTPException(status_code=404, detail="Expense not found")

    if current_user.role != "admin" and expense.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cross-company access is not allowed")

    # Load category and learning match for explanation
    category = None
    if expense.category_code:
        category = (
            db.query(AccountingCategory)
            .filter(
                AccountingCategory.company_id == expense.company_id,
                AccountingCategory.code == expense.category_code,
                AccountingCategory.is_active.is_(True),
            )
            .first()
        )

    learning_match = find_learning_match(db, expense.company_id, expense.description)

    data = ExpenseRead.model_validate(expense).model_dump()
    data["accounting_explanation"] = explain_accounting_decision(expense, category, learning_match)
    return data


@router.patch("/{expense_id}", response_model=ExpenseRead)
def update_expense_route(expense_id: int, payload: ExpenseUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        existing = get_expense(db, expense_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="Expense not found")
        if current_user.role != "admin" and existing.company_id != current_user.company_id:
            raise HTTPException(status_code=403, detail="Cross-company access is not allowed")
        expense = update_expense(db, expense_id, payload)
        return expense
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# Legacy /expenses/{id}/submit, /approve, /reject endpoints have been removed.
# All expense status transitions are handled exclusively by
# /expenses/review-actions/* (review_actions_router.py → transition_service.py).


@router.get("/config/account-mapping/{setup_session_id}")
def get_account_mapping_config_route(setup_session_id: int, db: Session = Depends(get_db)):
    config_text = get_account_mapping_config(db, setup_session_id)

    if config_text is None:
        raise HTTPException(status_code=404, detail="Account mapping config not found")

    return {"setup_session_id": setup_session_id, "config_text": config_text}


@router.delete("/{expense_id}")
def delete_expense_route(expense_id: int, db: Session = Depends(get_db)):
    try:
        result = delete_expense(db, expense_id)

        if result is False:
            raise HTTPException(status_code=404, detail="Expense not found")

        return {"status": "deleted"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Tags ──────────────────────────────────────────────────────────────────────

@router.get("/tags")
def list_tags_route(company_id: int, db: Session = Depends(get_db)):
    return db.query(ExpenseTag).filter(ExpenseTag.company_id == company_id).order_by(ExpenseTag.name).all()


@router.post("/tags")
def create_tag_route(payload: dict, db: Session = Depends(get_db)):
    tag = ExpenseTag(
        company_id=payload.get("company_id", 1),
        name=payload["name"],
        color=payload.get("color"),
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


# ── Expense-level validation results (all docs for this expense) ─────────────

@router.get("/{expense_id}/validations", response_model=list[ValidationResultRead])
def list_expense_validations_route(expense_id: int, db: Session = Depends(get_db)):
    doc_ids = [
        row[0] for row in
        db.query(ExpenseDocument.id).filter(ExpenseDocument.expense_id == expense_id).all()
    ]
    if not doc_ids:
        return []
    return (
        db.query(ValidationResult)
        .filter(ValidationResult.document_id.in_(doc_ids))
        .order_by(ValidationResult.created_at.desc())
        .all()
    )
