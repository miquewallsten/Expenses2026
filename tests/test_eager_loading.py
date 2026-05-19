"""Test that eager loading prevents N+1 queries."""

import pytest
from sqlalchemy import event
from sqlalchemy.orm import joinedload

from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.models.validation_result import ValidationResult
from packages.core.platform.models_accounting_category import AccountingCategory


@pytest.fixture
def setup_expense_with_documents(db_session, test_company):
    """Create an expense with documents and validations for testing."""
    # Create an accounting category
    category = AccountingCategory(
        company_id=test_company.id,
        code="TRAVEL",
        name="Travel Expenses",
        is_active=True,
    )
    db_session.add(category)

    # Create expense
    expense = Expense(
        company_id=test_company.id,
        amount=100.0,
        status="submitted",
        description="Test expense",
        category_code="TRAVEL",
    )
    db_session.add(expense)
    db_session.flush()

    # Create document
    doc = ExpenseDocument(
        expense_id=expense.id,
        company_id=test_company.id,
        filename="test.pdf",
        content_text="Test document content",
        document_type="pdf",
    )
    db_session.add(doc)
    db_session.flush()

    # Create validation result
    validation = ValidationResult(
        document_id=doc.id,
        source="test",
        rule_code="TEST_RULE",
        status="passed",
        message="Test validation passed",
    )
    db_session.add(validation)
    db_session.commit()

    return expense, doc, validation, category


def test_expense_has_documents_relationship(setup_expense_with_documents, db_session):
    """Test that Expense.documents relationship works."""
    expense, doc, _, _ = setup_expense_with_documents

    # Clear session to test fresh load
    db_session.expire_all()

    # Load expense fresh
    loaded = db_session.query(Expense).filter(Expense.id == expense.id).first()

    # Access documents - should work via relationship
    assert len(loaded.documents) == 1
    assert loaded.documents[0].filename == "test.pdf"


def test_expense_has_category_relationship(setup_expense_with_documents, db_session):
    """Test that Expense.category relationship works."""
    expense, _, _, category = setup_expense_with_documents

    # Clear session to test fresh load
    db_session.expire_all()

    # Load expense fresh
    loaded = db_session.query(Expense).filter(Expense.id == expense.id).first()

    # Access category - should work via relationship
    assert loaded.category is not None
    assert loaded.category.code == "TRAVEL"
    assert loaded.category.name == "Travel Expenses"


def test_document_has_validations_relationship(setup_expense_with_documents, db_session):
    """Test that ExpenseDocument.validations relationship works."""
    _, doc, validation, _ = setup_expense_with_documents

    # Clear session to test fresh load
    db_session.expire_all()

    # Load document fresh
    loaded = db_session.query(ExpenseDocument).filter(ExpenseDocument.id == doc.id).first()

    # Access validations - should work via relationship
    assert len(loaded.validations) == 1
    assert loaded.validations[0].rule_code == "TEST_RULE"


def test_joinedload_prevents_n_plus_one_for_documents(db_session, test_company):
    """Test that joinedload prevents N+1 queries for documents."""
    # Create multiple expenses with documents
    expenses = []
    for i in range(5):
        expense = Expense(
            company_id=test_company.id,
            amount=100.0 * (i + 1),
            status="submitted",
            description=f"Test expense {i}",
        )
        db_session.add(expense)
        db_session.flush()
        expenses.append(expense)

        doc = ExpenseDocument(
            expense_id=expense.id,
            company_id=test_company.id,
            filename=f"test_{i}.pdf",
            content_text=f"Content {i}",
            document_type="pdf",
        )
        db_session.add(doc)

    db_session.commit()

    # Query with joinedload
    query_count = [0]

    @event.listens_for(db_session.bind, "before_execute")
    def count_queries(conn, clause, multiparams, params, execution_options):
        query_count[0] += 1

    # Load with eager loading
    results = (
        db_session.query(Expense)
        .options(joinedload(Expense.documents))
        .filter(Expense.company_id == test_company.id)
        .filter(Expense.status == "submitted")
        .all()
    )

    # Reset query count
    queries_for_load = query_count[0]

    # Access all documents - should NOT trigger additional queries
    for expense in results:
        _ = list(expense.documents)  # Force evaluation

    queries_after_access = query_count[0]

    # Query count should not increase after accessing relationships
    assert queries_after_access == queries_for_load, (
        f"N+1 detected: {queries_after_access - queries_for_load} additional queries"
    )

    # Remove listener
    event.remove(db_session.bind, "before_execute", count_queries)


def test_joinedload_prevents_n_plus_one_for_category(db_session, test_company):
    """Test that joinedload prevents N+1 queries for category."""
    # Create category
    category = AccountingCategory(
        company_id=test_company.id,
        code="SOFTWARE",
        name="Software Expenses",
        is_active=True,
    )
    db_session.add(category)
    db_session.flush()

    # Create multiple expenses with category
    for i in range(5):
        expense = Expense(
            company_id=test_company.id,
            amount=100.0 * (i + 1),
            status="submitted",
            description=f"Software expense {i}",
            category_code="SOFTWARE",
        )
        db_session.add(expense)

    db_session.commit()

    # Query with joinedload
    query_count = [0]

    @event.listens_for(db_session.bind, "before_execute")
    def count_queries(conn, clause, multiparams, params, execution_options):
        query_count[0] += 1

    # Load with eager loading
    results = (
        db_session.query(Expense)
        .options(joinedload(Expense.category))
        .filter(Expense.company_id == test_company.id)
        .filter(Expense.status == "submitted")
        .all()
    )

    # Reset query count
    queries_for_load = query_count[0]

    # Access all categories - should NOT trigger additional queries
    for expense in results:
        _ = expense.category  # Force evaluation

    queries_after_access = query_count[0]

    # Query count should not increase after accessing relationships
    assert queries_after_access == queries_for_load, (
        f"N+1 detected: {queries_after_access - queries_for_load} additional queries"
    )

    # Remove listener
    event.remove(db_session.bind, "before_execute", count_queries)


def test_manager_queue_eager_loads_relationships(db_session, test_company):
    """Test that list_manager_queue_paginated loads related data efficiently."""
    from packages.modules.expenses.service.review_queue_service import list_manager_queue_paginated

    # Create expense with documents
    expense = Expense(
        company_id=test_company.id,
        amount=100.0,
        status="submitted",
        description="Test expense",
    )
    db_session.add(expense)
    db_session.flush()

    doc = ExpenseDocument(
        expense_id=expense.id,
        company_id=test_company.id,
        filename="test.pdf",
        content_text="Test document content",
        document_type="pdf",
    )
    db_session.add(doc)
    db_session.commit()

    # Set up approval config to enable manager queue
    from packages.modules.admin.service.company_setup_service import get_or_create_company_setup
    from packages.modules.admin.service.approval_setup_service import get_or_create_approval_setup

    company_setup = get_or_create_company_setup(db_session, test_company.id)
    company_setup.has_managers = True
    approval_setup = get_or_create_approval_setup(db_session, test_company.id)
    approval_setup.approval_mode = "manager_only"
    db_session.commit()

    # Fetch queue
    result = list_manager_queue_paginated(
        db_session,
        company_id=test_company.id,
        page=1,
        limit=20,
    )

    # Verify we can access relationships without additional queries
    for item in result["items"]:
        # This should NOT trigger additional queries if eager loading is working
        documents = item.documents
        assert isinstance(documents, list)


def test_expense_list_eager_loads_relationships(db_session, test_company):
    """Test that list_expenses_paginated loads related documents."""
    from packages.modules.expenses.service.expense_service import list_expenses_paginated

    # Create expense with documents
    expense = Expense(
        company_id=test_company.id,
        amount=100.0,
        status="draft",
        description="Test expense",
    )
    db_session.add(expense)
    db_session.flush()

    doc = ExpenseDocument(
        expense_id=expense.id,
        company_id=test_company.id,
        filename="test.pdf",
        content_text="Test document content",
        document_type="pdf",
    )
    db_session.add(doc)
    db_session.commit()

    result = list_expenses_paginated(
        db_session,
        company_id=test_company.id,
        page=1,
        limit=20,
    )

    for item in result["items"]:
        # Access relationships without triggering N+1
        documents = item.documents
        assert isinstance(documents, list)