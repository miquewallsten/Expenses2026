"""Work execution tools for agent.

Domain module that groups expense and work-related execution tools.
Re-exports from the flat structure for backwards compatibility while
organizing tools by domain.
"""

from .. import expense_ops  # noqa: F401

__all__ = ["expense_ops"]