"""Channel-specific tools for WhatsApp and Email agent interactions.

These tools let the channel agents:
  - Submit time entries (for employees who track time)
  - Query expense reports (for managers/directors)
  - Submit expenses with receipt data extracted from photos
  - Approve/reject expenses via quick actions
"""

from . import time_tracking  # noqa: F401
from . import spend_reports  # noqa: F401
from . import whatsapp_expense  # noqa: F401
from . import whatsapp_approve  # noqa: F401

__all__ = ["time_tracking", "spend_reports", "whatsapp_expense", "whatsapp_approve"]
