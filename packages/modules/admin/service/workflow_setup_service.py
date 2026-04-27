"""WIP stub — workflow_setup_service.

User's in-flight refactor referenced this module before writing it.
Stubbed minimally so imports succeed; flesh out with real DB-backed
WorkflowSetup model when the workflow consolidation slice lands.
"""
from sqlalchemy.orm import Session


class _WorkflowSetupStub:
    """Duck-typed object exposing the fields the portal config router reads."""

    def __init__(self, company_id: int) -> None:
        self.company_id = company_id
        self.default_expense_workflow_mode = "standard"
        self.block_submit_on_failed_validation = False
        self.route_policy_failures_to = "none"


def get_or_create_workflow_setup(db: Session, company_id: int) -> _WorkflowSetupStub:
    return _WorkflowSetupStub(company_id=company_id)
