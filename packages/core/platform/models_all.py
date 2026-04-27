"""Central model import aggregator.

Importing this module registers every SQLAlchemy model with `Base.metadata`.
Used by `alembic/env.py` and `tests/conftest.py` so metadata is fully
populated before `create_all()` or migration autogenerate runs.

New tables MUST be added here. Do not import models directly in env.py /
conftest anymore — import this module instead.
"""

# Core platform
from packages.core.platform.models import Company  # noqa: F401
from packages.core.platform.models_user import User, MagicLinkToken  # noqa: F401
from packages.core.platform.models_user_notification_pref import (  # noqa: F401
    UserNotificationPreference,
)
from packages.core.platform.models_idempotency import IdempotencyRecord  # noqa: F401
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
from packages.core.platform.models_user_project import UserProjectAssignment  # noqa: F401
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
from packages.core.platform.models_ai_policy import AIPolicy  # noqa: F401
from packages.core.platform.models_approval_setup import ApprovalSetup  # noqa: F401
from packages.core.platform.models_archive_file import ArchiveFile  # noqa: F401
from packages.core.platform.models_archive_config import ArchiveConfig  # noqa: F401
from packages.core.platform.models_export_bundle_config import ExportBundleConfig  # noqa: F401
from packages.core.platform.models_export_config import ExportConfig  # noqa: F401
from packages.core.platform.models_orchestrator_session import OrchestratorSession  # noqa: F401
from packages.core.platform.models_orchestrator_audit import OrchestratorAuditLog  # noqa: F401
from packages.core.platform.models_purchase_request import PurchaseRequest  # noqa: F401
from packages.core.platform.models_request_attachment import RequestAttachment  # noqa: F401
from packages.core.platform.models_report_cycle import ReportCycleSettings  # noqa: F401
from packages.core.platform.models_auth_settings import CompanyAuthSettings  # noqa: F401
from packages.core.platform.models_storage_config import StorageConfig  # noqa: F401
from packages.core.platform.models_time_tracking import (  # noqa: F401
    TimeProject, TimeActivity, TimeAssignment, TimeEntry,
)

# Config engine
from packages.core.config_engine.models import (  # noqa: F401
    ConfigVersion, SetupArtifact, SetupDraft, SetupInference, SetupSession,
)
from packages.core.config_engine.models_module_setting import ModuleSetting  # noqa: F401

# Expenses
from packages.modules.expenses.models import Expense, ExpenseDocument, ExpenseReport, Poliza  # noqa: F401
from packages.modules.expenses.models.expense_allocation import ExpenseAllocation  # noqa: F401
from packages.modules.expenses.models.expense_attachment import ExpenseAttachment  # noqa: F401
from packages.modules.expenses.models.expense_policy_override import ExpensePolicyOverride  # noqa: F401
from packages.modules.expenses.models.tag import ExpenseTag  # noqa: F401
from packages.modules.expenses.models.validation_result import ValidationResult  # noqa: F401

# AI / embeddings
from packages.modules.ai.models_embedding import DocumentEmbedding  # noqa: F401
from packages.modules.ai.models_categorization_feedback import (  # noqa: F401
    CategorizationFeedback,
)
from packages.core.platform.models_ai_governance import (  # noqa: F401
    CompanyAiGovernancePolicy,
)

# Approval routing rules
from packages.modules.expenses.models_routing import (  # noqa: F401
    ApprovalRoutingRule,
)

# Channels
from packages.modules.channels.models import (  # noqa: F401
    ChannelSettings, ChannelConversation, ChannelMessage, ChannelVerification,
    NotificationDispatch, ActionLink,
)

# Agent
from packages.modules.agent.models import (  # noqa: F401
    AgentSession, AgentToolCall, AgentPendingAction, AgentUpload,
    AgentMemory, AgentInsight, AgentUsage,
)

# Amex reconciliation
from packages.modules.amex.models import (  # noqa: F401
    AmexStatement, AmexStatementLine, AmexCfdiDocument,
)

# Integrations / ERP bridge
from packages.modules.integrations.models import (  # noqa: F401
    Integration, IntegrationEndpoint, IntegrationSyncRun, ExpensePaymentStatus,
)
from packages.modules.integrations.models_public_api import (  # noqa: F401
    PlatformApiKey, WebhookSubscription, WebhookDelivery,
)
