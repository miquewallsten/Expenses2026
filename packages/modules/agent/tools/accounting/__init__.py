"""Accounting configuration tools for agent.

Domain module that groups accounting-related tools. Re-exports from the
flat structure for backwards compatibility while organizing tools by domain.
"""

from .. import accounting_category  # noqa: F401

__all__ = ["accounting_category"]