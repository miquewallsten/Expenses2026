"""Tests for HTML offline viewer generation."""

import pytest
from packages.modules.admin.service.html_viewer_generator import HTMLViewerGenerator


def test_generate_viewer_html():
    """Test generating offline HTML viewer."""
    generator = HTMLViewerGenerator()

    expenses = [
        {"id": 1, "description": "Test expense", "amount": "100.00", "status": "approved"}
    ]

    html = generator.generate_viewer(
        company_name="Test Company",
        expenses=expenses,
        categories=[],
        vendors=[],
    )

    assert html is not None
    assert "<!DOCTYPE html>" in html
    assert "Test Company" in html
    assert "Test expense" in html


def test_generate_data_js():
    """Test generating JavaScript data file."""
    generator = HTMLViewerGenerator()

    expenses = [
        {"id": 1, "description": "Office supplies", "amount": "50.00"}
    ]
    vendors = [
        {"name": "Office Depot", "rfc": "ODE123456ABC", "total_amount": "50.00"}
    ]

    js = generator.generate_data_js(expenses=expenses, vendors=vendors)

    assert js is not None
    assert "const EXPENSES" in js
    assert "const VENDORS" in js
    assert "Office supplies" in js


def test_generate_viewer_with_multiple_data_types():
    """Test generating viewer with expenses, categories, vendors, and audit."""
    generator = HTMLViewerGenerator()

    expenses = [
        {"id": 1, "description": "Test expense", "amount": "100.00", "status": "approved"},
        {"id": 2, "description": "Another expense", "amount": "200.00", "status": "pending"},
    ]
    categories = [
        {"code": "EXP001", "name": "Office Supplies", "description": "Office materials"}
    ]
    vendors = [
        {"name": "Office Depot", "rfc": "ODE123456ABC", "expense_count": 2, "total_amount": "300.00"}
    ]
    audit = [
        {"event_type": "expense.created", "entity_type": "Expense", "entity_id": 1, "occurred_at": "2024-01-01T10:00:00"}
    ]

    html = generator.generate_viewer(
        company_name="Test Company",
        expenses=expenses,
        categories=categories,
        vendors=vendors,
        audit=audit,
    )

    assert html is not None
    assert "Test expense" in html
    assert "Another expense" in html
    assert "Office Supplies" in html
    assert "Office Depot" in html
    assert "expense.created" in html


def test_generate_viewer_calculates_totals():
    """Test that viewer calculates summary totals correctly."""
    generator = HTMLViewerGenerator()

    expenses = [
        {"id": 1, "description": "Expense 1", "amount": "100.50"},
        {"id": 2, "description": "Expense 2", "amount": "200.25"},
    ]
    vendors = [
        {"name": "Vendor A", "rfc": "AAA123", "expense_count": 1, "total_amount": "100.50"},
        {"name": "Vendor B", "rfc": "BBB456", "expense_count": 1, "total_amount": "200.25"},
    ]

    html = generator.generate_viewer(
        company_name="Test Company",
        expenses=expenses,
        categories=[],
        vendors=vendors,
    )

    assert "2" in html  # total expenses
    assert "300.75" in html  # total amount (100.50 + 200.25)


def test_generate_viewer_handles_empty_data():
    """Test generating viewer with no data."""
    generator = HTMLViewerGenerator()

    html = generator.generate_viewer(
        company_name="Empty Company",
        expenses=[],
        categories=[],
        vendors=[],
    )

    assert html is not None
    assert "Empty Company" in html
    assert "0" in html  # total expenses


def test_generate_data_js_with_all_types():
    """Test generating JavaScript data file with all data types."""
    generator = HTMLViewerGenerator()

    expenses = [{"id": 1, "description": "Test", "amount": "100"}]
    categories = [{"code": "C001", "name": "Category"}]
    vendors = [{"name": "Vendor", "rfc": "V123"}]
    audit = [{"event_type": "test.event"}]

    js = generator.generate_data_js(
        expenses=expenses,
        categories=categories,
        vendors=vendors,
        audit=audit,
    )

    assert "const EXPENSES" in js
    assert "const CATEGORIES" in js
    assert "const VENDORS" in js
    assert "const AUDIT" in js


def test_viewer_contains_spanish_labels():
    """Test that HTML viewer contains Spanish interface labels."""
    generator = HTMLViewerGenerator()

    html = generator.generate_viewer(
        company_name="Test Company",
        expenses=[{"id": 1, "description": "Test", "amount": "100", "status": "approved"}],
        categories=[],
        vendors=[],
    )

    # Spanish labels
    assert "Gastos" in html
    assert "Categorías" in html
    assert "Proveedores" in html
    assert "Auditoría" in html


def test_viewer_status_badges():
    """Test that status badges are rendered correctly."""
    generator = HTMLViewerGenerator()

    expenses = [
        {"id": 1, "description": "Draft expense", "amount": "100", "status": "draft"},
        {"id": 2, "description": "Pending expense", "amount": "200", "status": "submitted"},
        {"id": 3, "description": "Approved expense", "amount": "300", "status": "approved"},
        {"id": 4, "description": "Rejected expense", "amount": "400", "status": "rejected"},
    ]

    html = generator.generate_viewer(
        company_name="Test Company",
        expenses=expenses,
        categories=[],
        vendors=[],
    )

    assert "status-draft" in html
    assert "status-submitted" in html
    assert "status-approved" in html
    assert "status-rejected" in html