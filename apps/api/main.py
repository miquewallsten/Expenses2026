from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import os

from apps.api.config import settings
from apps.api.db import Base, engine
from apps.api.deps import get_db
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
from packages.core.platform.models_delegation import Delegation  # noqa: F401
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
from packages.modules.expenses.models_routing import ApprovalRoutingRule  # noqa: F401
from packages.modules.admin.api.ai_policy_router import router as ai_policy_router
from packages.modules.admin.api.ai_governance_router import router as ai_governance_router
from packages.modules.admin.api.portal_config_router import router as portal_config_router
from packages.modules.admin.api.readiness_router import router as readiness_router
from packages.modules.admin.api.operations_router import router as admin_operations_router
from packages.modules.admin.api.dashboard_router import router as admin_dashboard_router
from packages.modules.admin.api.addons_router import router as admin_addons_router
from packages.modules.admin.api.onboarding_router import router as onboarding_router
# from packages.modules.admin.api.setup_orchestrator_router import router as setup_orchestrator_router  # Module does not exist
from packages.modules.admin.api.accounting_category_router import router as accounting_category_router
from packages.modules.admin.api.accounting_category_apply_router import router as accounting_category_apply_router
from packages.modules.admin.api.accounting_learning_router import router as accounting_learning_router
from packages.modules.accounting.api.chart_of_accounts_router import router as coa_router
from packages.modules.accounting.api.archive_router import router as archive_router
from packages.core.platform.api.wallet_router import router as wallet_router
from packages.core.platform.api.delegation_router import router as delegation_router
from packages.core.platform.api.user_preferences_router import router as user_preferences_router
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
from apps.api.routes.super_admin_agents import router as super_admin_agents_router
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
from packages.modules.agent.models_knowledge_chunk import KnowledgeChunk  # noqa: F401 — registers agent_knowledge_chunks table
from packages.modules.agent.api.agent_router import router as agent_router
from packages.modules.agent.api.agent_push_router import router as agent_push_router
from packages.modules.mywork.api.mywork_router import router as mywork_router
from apps.api.routes.super_admin import router as super_admin_router
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
from packages.modules.integrations.api.export_config_router import router as export_config_router
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

# Agent/Platform rate limiting with sliding window + burst allowance
from packages.core.middleware import RateLimitMiddleware, RateLimitConfig

app.add_middleware(
    RateLimitMiddleware,
    config=RateLimitConfig(
        requests_per_minute=60,
        burst=10,
        paths=("/api/agent/", "/api/platform/"),
    ),
)

# Phase 2.5 — Request-ID middleware + structured 500/422 responses.
from apps.api.observability import install as _install_observability  # noqa: E402

_install_observability(app)

# ── Celery initialization (optional) ──────────────────────────────────────────────────────
# Celery is optional – if the library or Redis is not available we skip it so the API can still start.
try:
    from packages.core.jobs.celery_app import celery_app as _celery_app

    # Use the same Redis URL as the main app (default localhost)
    _redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    _celery_app.conf.update(
        broker_url=_redis_url,
        result_backend=_redis_url,
    )
except Exception as exc:  # pragma: no cover – only triggers when Celery is missing
    import logging
    logging.getLogger(__name__).warning(
        "Celery initialization skipped – %s. Background jobs will be unavailable.",
        exc,
    )
    _celery_app = None  # type: ignore

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-User-Id", "Accept", "Origin"],
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
    
    # Skip migrations in test mode (SQLite in-memory)
    # Tests handle their own schema via conftest.py fixtures
    if os.environ.get("DATABASE_URL", "").startswith("sqlite://"):
        _mig_log.info("Skipping migrations in test mode (SQLite)")
        return
    
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
    # Skip backfill in test mode (SQLite in-memory database)
    if os.environ.get("DATABASE_URL", "").startswith("sqlite://"):
        import logging
        _log = logging.getLogger(__name__)
        _log.info("Skipping startup backfill in test mode")
        return
    
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
app.include_router(archive_router)
app.include_router(wallet_router)
app.include_router(delegation_router)
app.include_router(user_preferences_router)
app.include_router(approval_setup_router)
app.include_router(readiness_router)
app.include_router(admin_operations_router)
app.include_router(admin_dashboard_router)
app.include_router(admin_addons_router)
app.include_router(onboarding_router)
app.include_router(portal_config_router)
app.include_router(super_admin_agents_router)

def _seed_agent_defaults() -> None:
    # Skip agent seeding in test mode (SQLite in-memory database)
    if os.environ.get("DATABASE_URL", "").startswith("sqlite://"):
        import logging
        _seed_log = logging.getLogger(__name__)
        _seed_log.info("Skipping agent seeding in test mode")
        return
    
    import logging
    _seed_log = logging.getLogger(__name__)
    try:
        from apps.api.db import SessionLocal
        from packages.modules.agent.core.agent_definition_service import AGENT_DEF_SERVICE
        from packages.modules.agent.tools import registry_all  # noqa: F401
        db = SessionLocal()
        AGENT_DEF_SERVICE.seed_defaults(db)
        _seed_log.info("Agent defaults seeded.")
    except Exception:
        _seed_log.exception("Agent seed failed — startup unaffected")
    finally:
        db.close()

_seed_agent_defaults()

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
app.include_router(wallet_router)
app.include_router(archive_config_router)
app.include_router(archive_query_router)
app.include_router(document_triage_router)
app.include_router(cfdi_pairing_router)
app.include_router(auth_router)
app.include_router(auth_settings_router)
app.include_router(whatsapp_webhook_router)
app.include_router(email_inbound_router)
app.include_router(channels_admin_router)
from packages.modules.channels.api.preferences_router import (  # noqa: E402
    router as preferences_router,
)
app.include_router(preferences_router)
from packages.modules.channels.api.action_links_router import (  # noqa: E402
    router as action_links_router,
)
from packages.modules.channels.api.user_phone_router import (  # noqa: E402
    router as user_phone_router,
)
app.include_router(action_links_router)
app.include_router(user_phone_router)
app.include_router(purchase_requests_router)
app.include_router(time_tracking_router)
app.include_router(report_cycle_router)
app.include_router(storage_config_router)
app.include_router(ai_policy_router)
app.include_router(ai_governance_router)
from packages.modules.admin.api.category_memory_router import (  # noqa: E402
    router as category_memory_router,
)
app.include_router(category_memory_router)
from packages.modules.admin.api.platform_api_router import (  # noqa: E402
    router as platform_api_router,
)
app.include_router(platform_api_router)
from packages.modules.admin.api.audit_log_router import (  # noqa: E402
    router as audit_log_router,
)
app.include_router(audit_log_router)
from packages.modules.admin.api.export_router import (  # noqa: E402
    router as export_router,
)
app.include_router(export_router)
from packages.modules.admin.api.routing_rules_router import (  # noqa: E402
    router as routing_rules_router,
)
app.include_router(routing_rules_router)
app.include_router(agent_router)
app.include_router(agent_push_router)
from packages.modules.agent.api.platform_router import (  # noqa: E402
    router as agent_platform_router,
)
from packages.modules.agent.api.agent_lifecycle_router import (  # noqa: E402
    router as agent_lifecycle_router,
)
from packages.modules.agent.api.agent_ws import router as agent_ws_router
from packages.modules.agent.api.llm_config_router import router as llm_config_router
from packages.modules.agent.api.insights_router import router as insights_router  # noqa: E402
app.include_router(agent_platform_router)
app.include_router(agent_lifecycle_router)
app.include_router(agent_ws_router)
app.include_router(llm_config_router)
app.include_router(insights_router)
app.include_router(mywork_router)
app.include_router(super_admin_router)
app.include_router(amex_router)
app.include_router(integrations_router)
app.include_router(export_config_router)
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

# ── Accounting enrichment routers (Phase F) ──────────────────────────────────
from packages.modules.accounting.api.auto_categorization_router import (  # noqa: E402
    router as auto_categorization_router,
)
from packages.modules.accounting.api.accounting_dashboard_router import (  # noqa: E402
    router as accounting_dashboard_router,
)
from packages.modules.accounting.api.smart_dimension_router import (  # noqa: E402
    router as smart_dimension_router,
)
from packages.modules.accounting.api.subcontractor_router import (  # noqa: E402
    router as subcontractor_router,)
from packages.modules.subcontractor.api.router import (  # noqa: E402
    router as subcontractor_portal_router,
)
from packages.modules.accounting.api.time_tracking_accounting_router import (  # noqa: E402
    router as time_tracking_accounting_router,
)
app.include_router(auto_categorization_router)
app.include_router(accounting_dashboard_router)
app.include_router(smart_dimension_router)
app.include_router(subcontractor_router)
app.include_router(subcontractor_portal_router)
app.include_router(time_tracking_accounting_router)

from packages.modules.accounting.api.accounting_intelligence_router import (  # noqa: E402
    router as accounting_intelligence_router,
)
app.include_router(accounting_intelligence_router)

from packages.modules.expenses.api.report_builder_router import (  # noqa: E402
    router as report_builder_router,
)
app.include_router(report_builder_router)


# ── Channel notification scheduler (opt-in via env var) ──────────────────────
try:
    from packages.modules.channels.jobs.scheduler import (
        start_scheduler as _start_channels_scheduler,
    )

    _start_channels_scheduler()
except Exception:
    import logging as _log

    _log.getLogger(__name__).exception("Failed to start channels scheduler")

# ── IMAP Mailbox Agent (opt-in via IMAP_POLLING_ENABLED) ─────────────────────
try:
    from packages.modules.channels.jobs.mail_sweeper import start_mailbox_agent

    start_mailbox_agent()
except Exception:
    import logging as _log

    _log.getLogger(__name__).exception("Failed to start IMAP mailbox agent")


# ── Phase 8.5 — Agent insight scheduler (opt-in via AGENT_SCHEDULER_ENABLED) ──
try:
    from packages.modules.agent.jobs.scheduler import (
        start_scheduler as _start_agent_scheduler,
    )

    _start_agent_scheduler()
except Exception:
    import logging as _log

    _log.getLogger(__name__).exception("Failed to start agent scheduler")


# ── Phase 4.8 follow-up — CFDI watcher scheduler (opt-in via CFDI_SCHEDULER_ENABLED) ──
try:
    from packages.modules.expenses.jobs.scheduler import (
        start_scheduler as _start_cfdi_scheduler,
    )

    _start_cfdi_scheduler()
except Exception:
    import logging as _log

    _log.getLogger(__name__).exception("Failed to start CFDI scheduler")


@app.get("/")
def root():
    return {
        "status": "ok",
        "message": "API is running",
        "environment": settings.environment,
    }


# ── Phase 2.6 — Health probes ────────────────────────────────────────────────


@app.get("/health/ready")
def health_ready(db: Session = Depends(get_db)) -> dict:
    """Readiness probe — checks DB, storage write, optional Ollama.

    Returns 200 with per-subsystem detail if all required checks pass;
    503 (via FastAPI HTTPException) if any required check fails. Ollama
    is reported but never blocks readiness — local LLM is best-effort.
    """
    from fastapi import HTTPException
    from sqlalchemy import text as _sql_text
    import os as _os
    import tempfile as _tempfile

    detail: dict = {"db": "unknown", "storage": "unknown", "ollama": "skipped"}
    failed = False

    # DB ping
    try:
        db.execute(_sql_text("SELECT 1"))
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

    # LLM — best-effort, non-blocking
    try:
        import urllib.request as _ur

        llm_base = _os.environ.get("LLM_BASE_URL", "").rstrip("/")
        llm_key = _os.environ.get("LLM_API_KEY", "")
        ollama_base = _os.environ.get("OLLAMA_BASE_URL", "").rstrip("/")
        if llm_base and llm_key:
            _headers = {"Authorization": f"Bearer {llm_key}"}
            _req = _ur.Request(f"{llm_base}/models", headers=_headers)
            with _ur.urlopen(_req, timeout=5.0) as resp:
                detail["llm"] = "ok" if resp.status == 200 else f"status_{resp.status}"
        elif ollama_base:
            with _ur.urlopen(f"{ollama_base}/api/tags", timeout=1.0) as resp:
                detail["ollama"] = "ok" if resp.status == 200 else f"status_{resp.status}"
        else:
            detail["llm"] = "not_configured"
    except Exception as exc:
        detail["llm"] = f"error: {type(exc).__name__}"

    if failed:
        raise HTTPException(status_code=503, detail=detail)
    return {"status": "ok", "detail": detail}

def _seed_demo_data() -> None:
    """Seed demo company, users, and setup if they don't exist.
    
    Creates a Demo Company with 7 users covering all roles:
    - Super Admin (super_admin)
    - Admin (admin)
    - Accounting (accounting)
    - Manager (manager)
    - Executive (executive)
    - Employee (employee)
    - Secretary/Executive Assistant (secretary)
    
    All users get password 'demo1234'.
    Only runs in development/staging environments.
    """
    import logging
    _seed_log = logging.getLogger(__name__)
    
    env = os.environ.get("ENVIRONMENT", "development").lower().strip()
    if env in ("production", "prod"):
        _seed_log.info("Skipping demo data seeding in production")
        return
    
    if os.environ.get("DATABASE_URL", "").startswith("sqlite://"):
        _seed_log.info("Skipping demo data seeding in test mode")
        return
    
    try:
        from apps.api.db import SessionLocal
        from packages.core.platform.models import Company
        from packages.core.platform.models_user import User
        from packages.core.platform.models_company_setup import CompanySetup
        from packages.core.platform.password_utils import hash_password
        
        db = SessionLocal()
        
        # Check if demo company already exists
        demo_company = db.query(Company).filter(Company.slug == "demo").first()
        if not demo_company:
            demo_company = Company(name="Demo Company", slug="demo")
            db.add(demo_company)
            db.flush()
            _seed_log.info(f"Created demo company: {demo_company.name} (id={demo_company.id})")
        
        # Create/update CompanySetup with dev_login_enabled=True
        setup = db.query(CompanySetup).filter(CompanySetup.company_id == demo_company.id).first()
        if not setup:
            setup = CompanySetup(
                company_id=demo_company.id,
                dev_login_enabled=True,
                expenses_module_enabled=True,
                onboarding_step="complete",
            )
            db.add(setup)
            _seed_log.info(f"Created company setup for demo company")
        elif not setup.dev_login_enabled:
            setup.dev_login_enabled = True
            _seed_log.info(f"Enabled dev_login for demo company")
        
        # Demo users
        demo_users = [
            {"email": "admin@demo.com", "full_name": "Admin Demo", "role": "admin", "can_access_accounting": True},
            {"email": "accounting@demo.com", "full_name": "Contador Demo", "role": "accounting", "can_access_accounting": True, "can_view_analytics": True},
            {"email": "manager@demo.com", "full_name": "Gerente Demo", "role": "manager"},
            {"email": "executive@demo.com", "full_name": "Director Demo", "role": "executive", "has_executive_reporting": True},
            {"email": "employee@demo.com", "full_name": "Empleado Demo", "role": "employee"},
            {"email": "secretary@demo.com", "full_name": "Asistente Demo", "role": "secretary"},
            {"email": "superadmin@demo.com", "full_name": "Super Admin", "role": "admin", "is_super_admin": True },
        ]
        
        created = 0
        for udata in demo_users:
            existing = db.query(User).filter(User.email == udata["email"]).first()
            if not existing:
                user = User(
                    email=udata["email"],
                    full_name=udata["full_name"],
                    role=udata["role"],
                    company_id=demo_company.id,
                    is_active=True,
                    password_hash=hash_password("demo1234"),
                    is_super_admin=udata.get("is_super_admin", False),
                    can_create_expenses=True,
                    can_access_accounting=udata.get("can_access_accounting", False),
                    has_executive_reporting=udata.get("has_executive_reporting", False),
                )
                db.add(user)
                created += 1
        
        if created:
            _seed_log.info(f"Created {created} demo users for company {demo_company.name}")
        else:
            _seed_log.info(f"Demo users already exist, skipping")
        
        db.commit()
    except Exception:
        _seed_log.exception("Demo data seed failed — startup unaffected")
    finally:
        try:
            db.close()
        except Exception:
            pass


_seed_demo_data()
