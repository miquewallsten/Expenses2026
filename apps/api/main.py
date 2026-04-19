from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from apps.api.config import settings
from apps.api.db import Base, engine
from apps.api.routes import health

from packages.core.platform.api.router import router as platform_router
from packages.core.platform.api.audit import router as audit_router
from packages.core.platform.api.modules import router as modules_router
from packages.core.config_engine.api.router import router as config_router
from packages.modules.expenses.api.router import router as expenses_router
from apps.api.ai.routes import router as ai_router

from packages.modules.expenses.models import Expense, ExpenseDocument, ExpenseReport, Poliza
from packages.core.config_engine.models import (
    ConfigVersion,
    SetupArtifact,
    SetupDraft,
    SetupInference,
    SetupSession,
)
from packages.core.platform.models_user import User
from packages.core.platform.models_audit import AuditLog
from packages.core.platform.models_module import PlatformModule
from packages.core.platform.models_company_module import CompanyModule
from packages.core.platform.models_project import Project
from packages.core.platform.models_client import Client
from packages.core.platform.models_cost_center import CostCenter
from packages.modules.expenses.models.expense_allocation import ExpenseAllocation
from packages.modules.expenses.models.expense_attachment import ExpenseAttachment
from packages.core.platform.models_role import Role
from packages.core.platform.models_permission import Permission
from packages.core.platform.models_role_permission import RolePermission
from packages.core.platform.models_user_role import UserRole
from packages.core.platform.models_workflow_stage import WorkflowStage
from packages.core.platform.models_workflow_transition import WorkflowTransition
from packages.core.platform.api.roles import router as roles_router
from packages.core.platform.api.workflows import router as workflows_router
from packages.core.config_engine.models_module_setting import ModuleSetting
from packages.core.config_engine.api.module_settings import router as module_settings_router
from packages.core.platform.models_expense_policy import CompanyExpensePolicy
from packages.modules.expenses.api.policy_router import router as expense_policy_router
from packages.core.platform.models_company_setup import CompanySetup
from packages.core.platform.models_legal_entity import LegalEntity
from packages.core.platform.models_accounting_category import AccountingCategory
from packages.core.platform.models_accounting_learning import AccountingLearning
from packages.core.platform.models_accounting_setup import AccountingSetup
from packages.core.platform.models_approval_setup import ApprovalSetup
from packages.core.platform.models_workflow_setup import WorkflowSetup
from packages.modules.admin.api.company_setup_router import router as company_setup_router
from packages.modules.admin.api.accounting_setup_router import router as accounting_setup_router
from packages.modules.admin.api.approval_setup_router import router as approval_setup_router
from packages.modules.admin.api.workflow_setup_router import router as workflow_setup_router
from packages.modules.admin.api.portal_config_router import router as portal_config_router
from packages.modules.admin.api.accounting_category_router import router as accounting_category_router
from packages.modules.admin.api.accounting_category_apply_router import router as accounting_category_apply_router
from packages.modules.admin.api.accounting_learning_router import router as accounting_learning_router
from packages.modules.admin.api.setup_orchestrator_router import router as setup_orchestrator_router
from packages.modules.expenses.api.manager_queue_router import router as manager_queue_router
from packages.modules.expenses.api.accounting_queue_router import router as accounting_queue_router
from packages.modules.expenses.api.expense_actions_router import router as expense_actions_router
from packages.modules.expenses.api.review_actions_router import router as review_actions_router
from packages.modules.expenses.api.accounting_work_router import router as accounting_work_router
from packages.modules.expenses.api.expense_blockers_router import router as expense_blockers_router
from packages.modules.expenses.api.expense_allocations_router import router as expense_allocations_router
from packages.modules.expenses.api.expense_allocation_edit_router import router as expense_allocation_edit_router
from packages.modules.accounting.api.export_router import router as accounting_export_router
from packages.modules.accounting.api.export_bundle_router import router as export_bundle_router
from packages.modules.accounting.api.export_config_router import router as accounting_export_config_router
from packages.core.platform.models_archive_file import ArchiveFile  # noqa: F401 — registers archive_files table
from packages.core.platform.models_archive_config import ArchiveConfig  # noqa: F401 — registers archive_configs table
from packages.core.platform.models_export_bundle_config import ExportBundleConfig  # noqa: F401 — registers export_bundle_configs table
from packages.modules.archive.api.archive_router import router as archive_router
from packages.modules.archive.api.archive_config_router import router as archive_config_router
from packages.modules.archive.api.archive_query_router import router as archive_query_router
from packages.modules.expenses.api.document_triage_router import router as document_triage_router
from packages.modules.expenses.api.cfdi_pairing_router import router as cfdi_pairing_router

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Schema migrations ─────────────────────────────────────────────────────────
# Alembic is now the canonical migration tool. Run `alembic upgrade head` to
# apply all pending migrations. create_all is kept as a safety net for tables
# that don't yet have an Alembic migration (e.g. brand-new tables added during
# development before a migration is written).
def _run_migrations() -> None:
    import logging
    _mig_log = logging.getLogger(__name__)
    try:
        from alembic.config import Config
        from alembic import command
        alembic_cfg = Config("alembic.ini")
        command.upgrade(alembic_cfg, "head")
        _mig_log.info("Alembic upgrade head completed.")
    except Exception:
        _mig_log.exception("Alembic upgrade failed — falling back to create_all")
    # create_all covers any tables that exist in the models but not yet in
    # an Alembic migration (safe: only creates, never drops or alters).
    Base.metadata.create_all(bind=engine)

_run_migrations()

# ── Startup backfill ──────────────────────────────────────────────────────────
# Idempotent repair pass: fixes expenses that have amount=0, filename-as-
# description, or missing expense_date when a CFDI XML is already linked.
# Runs on every server start; skips expenses that are already correct.
def _run_backfill() -> None:
    from apps.api.db import SessionLocal
    from packages.modules.expenses.service.backfill_service import backfill_expenses_from_xml
    import logging
    _log = logging.getLogger(__name__)
    try:
        db = SessionLocal()
        n = backfill_expenses_from_xml(db)
        if n:
            _log.info("Startup backfill: repaired %s expense(s) from XML data", n)
    except Exception:
        _log.exception("Startup backfill failed — server startup unaffected")
    finally:
        db.close()

_run_backfill()

app.include_router(health.router)
app.include_router(platform_router)
app.include_router(audit_router)
app.include_router(modules_router)
app.include_router(config_router)
app.include_router(expenses_router)
app.include_router(ai_router)
app.include_router(roles_router)
app.include_router(workflows_router)
app.include_router(module_settings_router)
app.include_router(expense_policy_router)
app.include_router(company_setup_router)
app.include_router(accounting_setup_router)
app.include_router(approval_setup_router)
app.include_router(workflow_setup_router)
app.include_router(portal_config_router)
app.include_router(accounting_category_router)
app.include_router(accounting_category_apply_router)
app.include_router(accounting_learning_router)
app.include_router(setup_orchestrator_router)
app.include_router(manager_queue_router)
app.include_router(accounting_queue_router)
app.include_router(accounting_work_router)
app.include_router(expense_blockers_router)
app.include_router(expense_allocations_router)
app.include_router(expense_allocation_edit_router)
app.include_router(expense_actions_router)
app.include_router(review_actions_router)
app.include_router(accounting_export_router)
app.include_router(export_bundle_router)
app.include_router(accounting_export_config_router)
app.include_router(archive_router)
app.include_router(archive_config_router)
app.include_router(archive_query_router)
app.include_router(document_triage_router)
app.include_router(cfdi_pairing_router)


@app.get("/")
def root():
    return {
        "status": "ok",
        "message": "API is running",
        "environment": settings.environment,
    }