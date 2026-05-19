"""Test pagination in expense list endpoints."""

import pytest
from packages.modules.expenses.service.expense_service import list_expenses_paginated


def test_expense_list_pagination(db_session, test_company, test_user):
    """Test that expense list returns paginated results."""
    from packages.modules.expenses.models.expense import Expense

    # Create 75 expenses
    for i in range(75):
        expense = Expense(
            company_id=test_company.id,
            amount=100.0,
            status="draft",
            description=f"Expense {i}",
        )
        db_session.add(expense)
    db_session.commit()

    # Test default pagination
    result = list_expenses_paginated(
        db_session,
        company_id=test_company.id,
        page=1,
        limit=20,
    )

    assert result["total"] == 75
    assert len(result["items"]) == 20
    assert result["pages"] == 4

    # Test with status filter
    result = list_expenses_paginated(
        db_session,
        company_id=test_company.id,
        page=1,
        limit=50,
        status="draft",
    )

    assert result["total"] == 75
    assert len(result["items"]) == 50


def test_expense_pagination_second_page(db_session, test_company, test_user):
    """Test that pagination correctly returns second page."""
    from packages.modules.expenses.models.expense import Expense

    # Create 30 expenses
    for i in range(30):
        expense = Expense(
            company_id=test_company.id,
            amount=100.0 + i,
            status="draft",
            description=f"Expense {i}",
        )
        db_session.add(expense)
    db_session.commit()

    # Get first page
    result_page1 = list_expenses_paginated(
        db_session,
        company_id=test_company.id,
        page=1,
        limit=10,
    )

    # Get second page
    result_page2 = list_expenses_paginated(
        db_session,
        company_id=test_company.id,
        page=2,
        limit=10,
    )

    assert result_page1["total"] == 30
    assert result_page2["total"] == 30
    assert len(result_page1["items"]) == 10
    assert len(result_page2["items"]) == 10
    assert result_page1["pages"] == 3
    assert result_page2["pages"] == 3

    # Verify items are different
    ids_page1 = {e.id for e in result_page1["items"]}
    ids_page2 = {e.id for e in result_page2["items"]}
    assert ids_page1.isdisjoint(ids_page2), "Pages should not overlap"


def test_expense_pagination_respects_company_isolation(db_session, test_company, test_user):
    """Test that pagination respects company isolation."""
    from packages.modules.expenses.models.expense import Expense
    from packages.core.platform.models import Company

    # Create another company
    other_company = Company(name="Other Company", slug="other-co")
    db_session.add(other_company)
    db_session.commit()
    db_session.refresh(other_company)

    # Create expenses for test_company
    for i in range(10):
        expense = Expense(
            company_id=test_company.id,
            amount=100.0,
            status="draft",
            description=f"Test Company Expense {i}",
        )
        db_session.add(expense)

    # Create expenses for other_company
    for i in range(20):
        expense = Expense(
            company_id=other_company.id,
            amount=200.0,
            status="draft",
            description=f"Other Company Expense {i}",
        )
        db_session.add(expense)
    db_session.commit()

    # Query only test_company
    result = list_expenses_paginated(
        db_session,
        company_id=test_company.id,
        page=1,
        limit=50,
    )

    assert result["total"] == 10
    assert len(result["items"]) == 10
    for item in result["items"]:
        assert item.company_id == test_company.id


def test_expense_pagination_status_filter(db_session, test_company, test_user):
    """Test that status filter works with pagination."""
    from packages.modules.expenses.models.expense import Expense

    # Create expenses with different statuses
    for i in range(20):
        expense = Expense(
            company_id=test_company.id,
            amount=100.0,
            status="draft",
            description=f"Draft Expense {i}",
        )
        db_session.add(expense)

    for i in range(15):
        expense = Expense(
            company_id=test_company.id,
            amount=200.0,
            status="submitted",
            description=f"Submitted Expense {i}",
        )
        db_session.add(expense)
    db_session.commit()

    # Filter by draft
    result_draft = list_expenses_paginated(
        db_session,
        company_id=test_company.id,
        page=1,
        limit=50,
        status="draft",
    )

    assert result_draft["total"] == 20
    for item in result_draft["items"]:
        assert item.status == "draft"

    # Filter by submitted
    result_submitted = list_expenses_paginated(
        db_session,
        company_id=test_company.id,
        page=1,
        limit=50,
        status="submitted",
    )

    assert result_submitted["total"] == 15
    for item in result_submitted["items"]:
        assert item.status == "submitted"


def test_expense_pagination_max_limit(db_session, test_company, test_user):
    """Test that limit is capped at 100."""
    from packages.modules.expenses.models.expense import Expense

    # Create 150 expenses
    for i in range(150):
        expense = Expense(
            company_id=test_company.id,
            amount=100.0,
            status="draft",
            description=f"Expense {i}",
        )
        db_session.add(expense)
    db_session.commit()

    # Request limit 200, should be capped to 100
    result = list_expenses_paginated(
        db_session,
        company_id=test_company.id,
        page=1,
        limit=200,  # Should be capped to 100
    )

    assert result["total"] == 150
    assert len(result["items"]) == 100  # Capped at 100