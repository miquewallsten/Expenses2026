"""Test pagination in review queue endpoints."""

import pytest
from decimal import Decimal

from packages.modules.expenses.service.review_queue_service import (
    list_manager_queue_paginated,
    list_accounting_queue_paginated,
)
from packages.modules.expenses.models.expense import Expense
from packages.modules.admin.service.company_setup_service import (
    get_or_create_company_setup,
)
from packages.modules.admin.service.approval_setup_service import (
    get_or_create_approval_setup,
)
from packages.modules.admin.service.accounting_setup_service import (
    get_or_create_accounting_setup,
)


@pytest.fixture
def setup_approval_flow(db_session, test_company):
    """Set up company for manager and accounting approval flow."""
    # Enable manager flow
    company_setup = get_or_create_company_setup(db_session, test_company.id)
    company_setup.has_managers = True
    company_setup.accounting_module_enabled = True

    # Set approval mode to manager_then_accounting so both queues work
    approval_setup = get_or_create_approval_setup(db_session, test_company.id)
    approval_setup.approval_mode = "manager_then_accounting"

    # Enable accounting review
    accounting_setup = get_or_create_accounting_setup(db_session, test_company.id)
    accounting_setup.accounting_review_mode = "all"

    db_session.commit()
    return {
        "company_setup": company_setup,
        "approval_setup": approval_setup,
        "accounting_setup": accounting_setup,
    }


def test_manager_queue_pagination(db_session, test_company, setup_approval_flow):
    """Test that manager queue returns paginated results."""
    # Create 55 expenses in manager queue (status='submitted')
    for i in range(55):
        expense = Expense(
            company_id=test_company.id,
            amount=Decimal("100.00"),
            status="submitted",
            description=f"Expense {i}",
        )
        db_session.add(expense)
    db_session.commit()

    # Test page 1
    result = list_manager_queue_paginated(
        db_session,
        company_id=test_company.id,
        page=1,
        limit=20,
    )

    assert result["page"] == 1
    assert result["pages"] == 3  # 55 items / 20 per page = 3 pages
    assert result["total"] == 55
    assert len(result["items"]) == 20

    # Test page 3 (last page)
    result = list_manager_queue_paginated(
        db_session,
        company_id=test_company.id,
        page=3,
        limit=20,
    )

    assert result["page"] == 3
    assert len(result["items"]) == 15  # 55 - 40 = 15 on last page


def test_accounting_queue_pagination(db_session, test_company, setup_approval_flow):
    """Test that accounting queue returns paginated results."""
    # Create 45 expenses in accounting queue (status='manager_approved')
    for i in range(45):
        expense = Expense(
            company_id=test_company.id,
            amount=Decimal("100.00"),
            status="manager_approved",
            description=f"Expense {i}",
        )
        db_session.add(expense)
    db_session.commit()

    result = list_accounting_queue_paginated(
        db_session,
        company_id=test_company.id,
        page=1,
        limit=20,
    )

    assert result["total"] == 45
    assert len(result["items"]) == 20


def test_manager_queue_pagination_respects_limit_cap(db_session, test_company, setup_approval_flow):
    """Test that limit is capped at 100."""
    # Create 150 expenses
    for i in range(150):
        expense = Expense(
            company_id=test_company.id,
            amount=Decimal("100.00"),
            status="submitted",
            description=f"Expense {i}",
        )
        db_session.add(expense)
    db_session.commit()

    # Request limit=200, should be capped to 100
    result = list_manager_queue_paginated(
        db_session,
        company_id=test_company.id,
        page=1,
        limit=200,
    )

    assert len(result["items"]) == 100  # capped at 100


def test_manager_queue_pagination_with_filters(db_session, test_company, setup_approval_flow):
    """Test that pagination works with amount filters."""
    # Create expenses with varying amounts
    for i in range(30):
        expense = Expense(
            company_id=test_company.id,
            amount=Decimal(str(i * 100)),  # 0, 100, 200, ... 2900
            status="submitted",
            description=f"Expense {i}",
        )
        db_session.add(expense)
    db_session.commit()

    # Filter for amounts >= 500
    result = list_manager_queue_paginated(
        db_session,
        company_id=test_company.id,
        page=1,
        limit=10,
        filters={"min_amount": Decimal("500")},
    )

    # Items 5-29 have amounts >= 500 (25 items)
    assert result["total"] == 25
    assert len(result["items"]) == 10  # first page


def test_accounting_queue_pagination_with_filters(db_session, test_company, setup_approval_flow):
    """Test that accounting queue pagination works with amount filters."""
    # Create expenses with varying amounts
    for i in range(30):
        expense = Expense(
            company_id=test_company.id,
            amount=Decimal(str(i * 100)),  # 0, 100, 200, ... 2900
            status="manager_approved",
            description=f"Expense {i}",
        )
        db_session.add(expense)
    db_session.commit()

    # Filter for amounts <= 1000
    result = list_accounting_queue_paginated(
        db_session,
        company_id=test_company.id,
        page=1,
        limit=10,
        filters={"max_amount": Decimal("1000")},
    )

    # Items 0-10 have amounts <= 1000 (11 items: 0, 100, 200, ..., 1000)
    assert result["total"] == 11
    assert len(result["items"]) == 10  # first page, capped at limit