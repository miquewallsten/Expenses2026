from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from apps.api.config import settings
from apps.api.db import Base, engine
from apps.api.routes import health
from apps.api.routes.me import router as me_router

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
from packages.core.platform.models_user import User, MagicLinkToken  # noqa: F401
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
from packages.modules.admin.api.company_setup_router import router as company_setup_router
from packages.modules.admin.api.accounting_setup_router import router as accounting_setup_router
from packages.modules.admin.api.approval_setup_router import router as approval_setup_router
from packages.modules.admin.api.dimensions_router import router as dimensions_router
from packages.core.platform.models_ai_policy import AIPolicy  # noqa: F401 — registers ai_policies table
from packages.core.platform.models_ai_governance import CompanyAiGovernancePolicy  # noqa: F401
from packages.modules.admin.api.ai_policy_router import router as ai_policy_router
from packages.modules.admin.api.ai_governance_router import router as ai_governance_router
from packages.modules.admin.api.portal_config_router import router as portal_config_router
from packages.modules.admin.api.accounting_category_router import router as accounting_category_router
from packages.modules.admin.api.accounting_category_apply_router import router as accounting_category_apply_router
from packages.modules.admin.api.accounting_learning_router import router as accounting_learning_router
from packages.modules.accounting.api.chart_of_accounts_router import router as coa_router
from packages.modules.expenses.api.manager_queue_router import router as manager_queue_router
from packages.modules.expenses.api.accounting_queue_router import router as accounting_queue_router
from packages.modules.expenses.api.expense_actions_router import router as expense_actions_router
from packages.modules.expenses.api.review_actions_router import router as review_actions_router
from packages.modules.expenses.api.accounting_work_router import router as accounting_work_router
from packages.modules.expenses.api.expense_blockers_router import router as expense_blockers_router
from packages.modules.expenses.api.expense_allocations_router import router as expense_allocations_router
from packages.modules.expenses.api.expense_allocation_edit_router import router as expense_allocation_edit_router
from packages.modules.expenses.api.policy_override_router import router as policy_override_router
from packages.modules.expenses.models.expense_policy_override import ExpensePolicyOverride  # noqa: F401 — registers table
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
from packages.modules.ai.models_embedding import DocumentEmbedding  # noqa: F401 — registers document_embeddings table
from packages.modules.ai.models_categorization_feedback import CategorizationFeedback  # noqa: F401 — registers categorization_feedback table
from apps.api.routes.auth import router as auth_router
from packages.core.platform.models_user_project import UserProjectAssignment  # noqa: F401
from packages.core.platform.models_auth_settings import CompanyAuthSettings  # noqa: F401
from packages.modules.admin.api.auth_settings_router import router as auth_settings_router
from packages.modules.channels.models import (  # noqa: F401 — registers channel tables
    ChannelSettings, ChannelConversation, ChannelMessage, ChannelVerification,
    NotificationDispatch, ActionLink,
)
from packages.modules.channels.api.whatsapp_webhook import router as whatsapp_webhook_router
from packages.modules.channels.api.email_inbound import router as email_inbound_router
from packages.modules.channels.api.admin_router import router as channels_admin_router
from packages.modules.channels.api.action_links_router import router as action_links_router
from packages.core.platform.models_purchase_request import PurchaseRequest as _PurchaseRequestModel  # noqa: F401
from packages.core.platform.models_request_attachment import RequestAttachment as _RequestAttachmentModel  # noqa: F401
from packages.modules.requests.router import router as purchase_requests_router
from packages.core.platform.models_time_tracking import (  # noqa: F401 — registers time tables
    TimeProject, TimeActivity, TimeAssignment, TimeEntry,
)
from packages.modules.time_tracking.router import router as time_tracking_router
from packages.core.platform.models_report_cycle import ReportCycleSettings  # noqa: F401 — registers table
from packages.modules.admin.api.report_cycle_router import router as report_cycle_router
from packages.core.platform.models_storage_config import StorageConfig  # noqa: F401 — registers storage_configs table
from packages.modules.admin.api.storage_config_router import router as storage_config_router
from packages.modules.agent.models import (  # noqa: F401 — registers agent_* tables
    AgentSession, AgentToolCall, AgentPendingAction, AgentUpload,
    AgentMemory, AgentInsight, AgentUsage,
)
from packages.modules.agent.api.agent_router import router as agent_router
from packages.modules.amex.models import (  # noqa: F401 — registers amex_* tables
    AmexStatement, AmexStatementLine, AmexCfdiDocument,
)
from packages.modules.amex.router import router as amex_router
from packages.modules.integrations.models import (  # noqa: F401 — registers integration tables
    Integration,
    IntegrationEndpoint,
    IntegrationSyncRun,
    ExpensePaymentStatus,
)
from packages.modules.integrations.models_public_api import (  # noqa: F401
    PlatformApiKey,
    WebhookSubscription,
    WebhookDelivery,
)
from packages.modules.integrations.router import router as integrations_router
from packages.modules.integrations.public_api_router import (
    router as public_api_router,
)

# Fail-fast: reject known-insecure defaults in production before the app
# starts serving requests.
settings.validate_for_production()

app = FastAPI(title=settings.app_name)

# ── Rate limiting ────────────────────────────────────────────────────────────
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from apps.api.rate_limit import limiter

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Phase 2.5 — Request-ID middleware + structured 500/422 responses.
from apps.api.observability import install as _install_observability  # noqa: E402

_install_observability(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static file serving for uploads (logos, etc.) ────────────────────────────
_uploads_dir = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")
os.makedirs(os.path.join(_uploads_dir, "logos"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_uploads_dir), name="uploads")

# ── Schema migrations ─────────────────────────────────────────────────────────
# Alembic is the canonical migration tool. In production we hard-fail on
# alembic errors so a broken migration is visible immediately instead of
# being silently masked by create_all (the bug Phase 8.13 surfaced — a
# failed migration left alembic_version stamped at a stale rev while
# create_all recreated downstream tables out-of-band, causing every
# subsequent boot to retry the same migration against tables that
# already existed).
#
# create_all remains the last-resort fallback only in dev/test, where
# fast iteration on brand-new models without a migration is convenient.
def _run_migrations() -> None:
    import logging
    _mig_log = logging.getLogger(__name__)
    # Ensure pgvector extension exists (idempotent).
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.commit()
    except Exception:
        pass  # Extension already exists — safe to ignore
    try:
        from alembic.config import Config
        from alembic import command
        alembic_cfg = Config("alembic.ini")
        command.upgrade(alembic_cfg, "head")
        _mig_log.info("Alembic upgrade head completed.")
    except Exception:
        _mig_log.exception("Alembic upgrade failed")
        if os.environ.get("ENVIRONMENT", "development").lower() == "production":
            # Re-raise so the container exits and orchestrator surfaces
            # the failure instead of silently masking it.
            raise
        _mig_log.warning("Falling back to create_all (non-production only)")
    # create_all covers tables introduced in models but not yet captured
    # by a migration. Safe: only creates, never drops or alters.
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
app.include_router(me_router)
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
app.include_router(coa_router)
app.include_router(approval_setup_router)
app.include_router(dimensions_router)
app.include_router(portal_config_router)
app.include_router(accounting_category_router)
app.include_router(accounting_category_apply_router)
app.include_router(accounting_learning_router)
app.include_router(manager_queue_router)
app.include_router(accounting_queue_router)
app.include_router(accounting_work_router)
app.include_router(expense_blockers_router)
app.include_router(expense_allocations_router)
app.include_router(expense_allocation_edit_router)
app.include_router(policy_override_router)
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
app.include_router(auth_router)
app.include_router(auth_settings_router)
app.include_router(whatsapp_webhook_router)
app.include_router(email_inbound_router)
app.include_router(channels_admin_router)
app.include_router(action_links_router)
from packages.modules.channels.api.preferences_router import (  # noqa: E402
    router as preferences_router,
)
app.include_router(preferences_router)
app.include_router(purchase_requests_router)
app.include_router(time_tracking_router)
app.include_router(report_cycle_router)
app.include_router(storage_config_router)
app.include_router(ai_policy_router)
app.include_router(ai_governance_router)
app.include_router(agent_router)
app.include_router(amex_router)
app.include_router(integrations_router)
app.include_router(public_api_router)
from packages.modules.expenses.api.finance_analytics_router import (  # noqa: E402
    router as finance_analytics_router,
)
app.include_router(finance_analytics_router)
from packages.modules.expenses.api.duplicate_detection_router import (  # noqa: E402
    router as duplicate_detection_router,
)
app.include_router(duplicate_detection_router)
from packages.modules.expenses.api.anomaly_detection_router import (  # noqa: E402
    router as anomaly_detection_router,
)
app.include_router(anomaly_detection_router)


# ── Channel notification scheduler (opt-in via env var) ──────────────────────
try:
    from packages.modules.channels.jobs.scheduler import (
        start_scheduler as _start_channels_scheduler,
    )

    _start_channels_scheduler()
except Exception:
    import logging as _log

    _log.getLogger(__name__).exception("Failed to start channels scheduler")


# ── Phase 8.5 — Agent insight scheduler (opt-in via AGENT_SCHEDULER_ENABLED) ──
try:
    from packages.modules.agent.jobs.scheduler import (
        start_scheduler as _start_agent_scheduler,
    )

    _start_agent_scheduler()
except Exception:
    import logging as _log

    _log.getLogger(__name__).exception("Failed to start agent scheduler")


@app.get("/")
def root():
    return {
        "status": "ok",
        "message": "API is running",
        "environment": settings.environment,
    }


# ── Phase 2.6 — Health probes ────────────────────────────────────────────────


@app.get("/health/ready")
def health_ready() -> dict:
    """Readiness probe — checks DB, storage write, optional Ollama.

    Returns 200 with per-subsystem detail if all required checks pass;
    503 (via FastAPI HTTPException) if any required check fails. Ollama
    is reported but never blocks readiness — local LLM is best-effort.
    """
    from fastapi import HTTPException
    from sqlalchemy import text as _sql_text
    import os as _os
    import tempfile as _tempfile

    from apps.api.db import engine as _engine

    detail: dict = {"db": "unknown", "storage": "unknown", "ollama": "skipped"}
    failed = False

    # DB ping
    try:
        with _engine.connect() as _conn:
            _conn.execute(_sql_text("SELECT 1"))
        detail["db"] = "ok"
    except Exception as exc:
        detail["db"] = f"error: {type(exc).__name__}"
        failed = True

    # Storage write — STORAGE_ROOT or ./storage
    try:
        storage_root = _os.environ.get("STORAGE_ROOT", "storage")
        _os.makedirs(storage_root, exist_ok=True)
        with _tempfile.NamedTemporaryFile(
            dir=storage_root, prefix=".healthz-", delete=True
        ) as _t:
            _t.write(b"ok")
            _t.flush()
        detail["storage"] = "ok"
    except Exception as exc:
        detail["storage"] = f"error: {type(exc).__name__}"
        failed = True

    # Ollama — best-effort, non-blocking
    try:
        import urllib.request as _ur

        base = _os.environ.get("OLLAMA_BASE_URL", "").rstrip("/")
        if base:
            with _ur.urlopen(f"{base}/api/tags", timeout=1.0) as resp:
                detail["ollama"] = "ok" if resp.status == 200 else f"status_{resp.status}"
        else:
            detail["ollama"] = "not_configured"
    except Exception as exc:
        detail["ollama"] = f"error: {type(exc).__name__}"

    if failed:
        raise HTTPException(status_code=503, detail=detail)
    return {"status": "ok", "detail": detail}