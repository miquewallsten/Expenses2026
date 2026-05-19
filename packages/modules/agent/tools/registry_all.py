"""Import-side-effect module — registers all agent tools.

Importing this module triggers ``REGISTRY.register(...)`` calls in each
submodule. The HTTP router imports this once at module load.

Tools are organized into domain directories for better discoverability:
- accounting/  — accounting configuration tools
- work/        — expense and work execution tools
- platform/    — tenant and provider management tools

Flat imports remain for backwards compatibility.
"""

# Flat imports (backwards compatibility)
from . import admin_tools       # noqa: F401
from . import config_patch      # noqa: F401
from . import creative          # noqa: F401
from . import diagnostic        # noqa: F401
from . import admin_config      # noqa: F401
from . import expense_bundling  # noqa: F401
from . import expense_ops       # noqa: F401
from . import expense_validation  # noqa: F401
from . import infra             # noqa: F401
from . import ingestion         # noqa: F401
from . import knowledge_tools   # noqa: F401
from . import memory            # noqa: F401
from . import org               # noqa: F401
from . import rbac              # noqa: F401
from . import read_tools        # noqa: F401
from . import readiness_tools   # noqa: F401
from . import search            # noqa: F401
from . import settings          # noqa: F401
from . import workflow          # noqa: F401
from . import accounting_category  # noqa: F401
from . import ai_policy         # noqa: F401
from . import finance_copilot   # noqa: F401
from . import platform          # noqa: F401
from .platform import mailbox_tools # noqa: F401

# Domain directories (new organization)
from . import accounting        # noqa: F401
from . import accounting_copilot_tools  # noqa: F401
from . import accounting_copilot_tools_v2  # noqa: F401
from . import work              # noqa: F401
from .work import bulk_ops      # noqa: F401

# Channel integration tools (WhatsApp, Email)
from .channel import time_tracking  # noqa: F401
from .channel import spend_reports  # noqa: F401
from .channel import whatsapp_expense  # noqa: F401
from .channel import whatsapp_approve  # noqa: F401

__all__ = [
    # Flat modules (backwards compatibility)
    "admin_tools", "config_patch", "creative", "diagnostic", "infra", "ingestion",
    "knowledge_tools", "memory", "org", "rbac", "read_tools", "readiness_tools",
    "search", "settings", "workflow", "accounting_category", "ai_policy",
    "finance_copilot", "platform",
    # Domain directories
    "accounting", "work",
    # Channel tools
    "channel",
]
from . import accounting_copilot_tools_intelligence  # noqa: F401
from . import report_builder  # noqa: F401
