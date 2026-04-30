"""Import-side-effect module — registers all agent tools.

Importing this module triggers ``REGISTRY.register(...)`` calls in each
submodule. The HTTP router imports this once at module load.
"""

from . import admin_tools       # noqa: F401
from . import config_patch      # noqa: F401
from . import creative          # noqa: F401
from . import diagnostic        # noqa: F401
from . import expense_ops       # noqa: F401
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

__all__ = [
    "admin_tools", "config_patch", "creative", "diagnostic", "infra", "ingestion",
    "knowledge_tools", "memory", "org", "rbac", "read_tools", "readiness_tools",
    "search", "settings", "workflow", "accounting_category", "ai_policy",
    "finance_copilot",
]
