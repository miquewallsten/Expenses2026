from logging.config import fileConfig
import sys
import os

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Make the project root importable so model imports work.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load .env so settings.database_url is populated before any import.
from dotenv import load_dotenv
load_dotenv()

# Import Base so Alembic knows all table metadata for autogenerate.
from apps.api.db import Base, engine as project_engine  # noqa: E402

# Core platform models
from packages.core.platform.models import Company  # noqa: F401
from packages.core.platform.models_user import User  # noqa: F401
from packages.core.platform.models_audit import AuditLog  # noqa: F401
from packages.core.platform.models_module import PlatformModule  # noqa: F401
from packages.core.platform.models_company_module import CompanyModule  # noqa: F401
from packages.core.platform.models_project import Project  # noqa: F401
from packages.core.platform.models_client import Client  # noqa: F401
from packages.core.platform.models_cost_center import CostCenter  # noqa: F401
from packages.core.platform.models_role import Role  # noqa: F401
from packages.core.platform.models_permission import Permission  # noqa: F401
from packages.core.platform.models_role_permission import RolePermission  # noqa: F401
from packages.core.platform.models_user_role import UserRole  # noqa: F401
from packages.core.platform.models_workflow_stage import WorkflowStage  # noqa: F401
from packages.core.platform.models_workflow_transition import WorkflowTransition  # noqa: F401
from packages.core.platform.models_expense_policy import CompanyExpensePolicy  # noqa: F401
from packages.core.platform.models_company_setup import CompanySetup  # noqa: F401
from packages.core.platform.models_legal_entity import LegalEntity  # noqa: F401
from packages.core.platform.models_accounting_category import AccountingCategory  # noqa: F401
from packages.core.platform.models_accounting_learning import AccountingLearning  # noqa: F401
from packages.core.platform.models_accounting_setup import AccountingSetup  # noqa: F401
from packages.core.platform.models_accounting_account import AccountingAccount  # noqa: F401
from packages.core.platform.models_tax_rate import TaxRate  # noqa: F401
from packages.core.platform.models_approval_setup import ApprovalSetup  # noqa: F401

from packages.core.platform.models_archive_file import ArchiveFile  # noqa: F401
from packages.core.platform.models_archive_config import ArchiveConfig  # noqa: F401
from packages.core.platform.models_export_bundle_config import ExportBundleConfig  # noqa: F401

# Config engine models
from packages.core.config_engine.models import (  # noqa: F401
    ConfigVersion, SetupArtifact, SetupDraft, SetupInference, SetupSession,
)
from packages.core.config_engine.models_module_setting import ModuleSetting  # noqa: F401

# Expense module models
from packages.modules.expenses.models import Expense, ExpenseDocument, ExpenseReport, Poliza  # noqa: F401
from packages.modules.expenses.models.expense_allocation import ExpenseAllocation  # noqa: F401
from packages.modules.expenses.models.expense_attachment import ExpenseAttachment  # noqa: F401

# Orchestrator models
from packages.core.platform.models_orchestrator_session import OrchestratorSession  # noqa: F401
from packages.core.platform.models_orchestrator_audit import OrchestratorAuditLog  # noqa: F401

# Vector / AI models
from packages.modules.ai.models_embedding import DocumentEmbedding  # noqa: F401
from packages.modules.ai.models_categorization_feedback import CategorizationFeedback  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = project_engine.url
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with project_engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
