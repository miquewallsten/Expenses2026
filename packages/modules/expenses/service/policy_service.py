from sqlalchemy.orm import Session

from packages.core.platform.models_expense_policy import CompanyExpensePolicy


def get_company_expense_policy(db: Session, company_id: int) -> CompanyExpensePolicy | None:
    return (
        db.query(CompanyExpensePolicy)
        .filter(CompanyExpensePolicy.company_id == company_id)
        .first()
    )


def get_or_create_company_expense_policy(db: Session, company_id: int) -> CompanyExpensePolicy:
    policy = get_company_expense_policy(db, company_id)
    if policy is None:
        policy = CompanyExpensePolicy(
            company_id=company_id,
            xml_required_mode="mxn_only",
            pdf_pair_required_for_cfdi=True,
            international_expenses_allowed=False,
            tickets_allowed=False,
            require_justification=False,
            require_proof=False,
            allow_split_allocations=True,
            allocation_dimensions="project_client_cost_center",
            manager_approval_required=False,
            accounting_review_required=True,
            ai_policy_assist_enabled=True,
        )
        db.add(policy)
        db.commit()
        db.refresh(policy)
    return policy


def upsert_company_expense_policy(db: Session, company_id: int, payload) -> CompanyExpensePolicy:
    policy = get_or_create_company_expense_policy(db, company_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(policy, field, value)
    db.commit()
    db.refresh(policy)
    return policy
