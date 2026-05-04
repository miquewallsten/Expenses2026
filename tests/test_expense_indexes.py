"""Test that composite indexes exist for expense queries."""

import pytest
from sqlalchemy import inspect

from packages.modules.expenses.models.expense import Expense
from packages.core.platform.models_archive_file import ArchiveFile


def test_expense_has_company_status_index():
    """Test that (company_id, status) composite index exists."""
    mapper = inspect(Expense)
    table = mapper.local_table
    indexes = list(table.indexes)

    # Check for composite index on (company_id, status)
    index_columns = [sorted([c.name for c in idx.columns]) for idx in indexes]

    # Should have either a dedicated index or covered by another
    has_company_status = (
        ['company_id', 'status'] in index_columns
    )

    # Also check for (company_id, created_at) for ordering
    has_company_created = (
        ['company_id', 'created_at'] in index_columns
    )

    assert has_company_status, "Missing index on (company_id, status)"
    assert has_company_created, "Missing index on (company_id, created_at)"


def test_archive_file_has_company_expense_index():
    """Test that archive files have (company_id, expense_id) index."""
    mapper = inspect(ArchiveFile)
    table = mapper.local_table
    indexes = list(table.indexes)
    index_columns = [sorted([c.name for c in idx.columns]) for idx in indexes]

    has_index = ['company_id', 'expense_id', 'file_name'] in index_columns
    assert has_index, "Missing index on (company_id, expense_id, file_name)"