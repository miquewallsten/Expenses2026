from logging.config import fileConfig
import sys
import os

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Make the project root importable so model imports work.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import Base so Alembic knows all table metadata for autogenerate.
# Import all model modules to register their tables — same list as main.py
# but WITHOUT importing main.py itself (which would trigger startup code).
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
from packages.core.platform.models_approval_setup import ApprovalSetup  # noqa: F401
from packages.core.platform.models_workflow_setup import WorkflowSetup  # noqa: F401
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

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    # Use the project's existing engine directly instead of creating a new one.
    with project_engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # Required for SQLite ALTER TABLE support.
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
