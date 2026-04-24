"""Cross-company isolation regression tests (Phase 0.2).

These tests exercise every expense endpoint that accepts either `expense_id`
or `company_id` as a path parameter, to prove that a caller from company A
cannot read or mutate data in company B.
"""
from decimal import Decimal

import pytest

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.expenses.models.expense import Expense


@pytest.fixture
def other_company(db_session):
    c = Company(name="Other Co", slug="other-iso")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    return c


@pytest.fixture
def other_expense(db_session, other_company):
    e = Expense(
        company_id=other_company.id,
        description="Foreign co expense",
        amount=Decimal("123.45"),
        status="submitted",
    )
    db_session.add(e)
    db_session.commit()
    db_session.refresh(e)
    return e


@pytest.fixture
def caller_headers(test_user):
    # Dev bypass — same auth surface a real caller would use.
    return {"X-User-Id": str(test_user.id)}


def _auth_manager_headers(db_session, test_company):
    mgr = User(
        full_name="Mgr A",
        email="mgr-a@iso.test",
        role="manager",
        company_id=test_company.id,
    )
    db_session.add(mgr)
    db_session.commit()
    db_session.refresh(mgr)
    return {"X-User-Id": str(mgr.id)}


class TestCrossCompanyExpenseReads:
    def test_get_single_expense(self, client, other_expense, caller_headers):
        r = client.get(f"/expenses/{other_expense.id}", headers=caller_headers)
        assert r.status_code == 404

    def test_get_expense_actions(self, client, other_expense, caller_headers):
        r = client.get(
            f"/expenses/actions/{other_expense.id}?portal_role=employee",
            headers=caller_headers,
        )
        assert r.status_code == 404

    def test_get_blockers(self, client, other_expense, caller_headers):
        r = client.get(
            f"/expenses/blockers/{other_expense.id}", headers=caller_headers
        )
        assert r.status_code == 404

    def test_list_allocations_summary(self, client, other_expense, caller_headers):
        r = client.get(
            f"/expenses/allocations-summary/{other_expense.id}",
            headers=caller_headers,
        )
        assert r.status_code == 404

    def test_list_documents_by_expense(self, client, other_expense, caller_headers):
        r = client.get(
            f"/expenses/documents/by-expense/{other_expense.id}",
            headers=caller_headers,
        )
        assert r.status_code == 404


class TestCrossCompanyExpenseWrites:
    def test_manager_approve_other_company(
        self, client, db_session, test_company, other_expense
    ):
        headers = _auth_manager_headers(db_session, test_company)
        r = client.post(
            f"/expenses/review-actions/{other_expense.id}/manager-approve",
            headers=headers,
        )
        assert r.status_code == 404, r.text

    def test_accounting_approve_other_company(
        self, client, db_session, test_company, other_expense
    ):
        headers = _auth_manager_headers(db_session, test_company)
        r = client.post(
            f"/expenses/review-actions/{other_expense.id}/accounting-approve",
            headers=headers,
        )
        assert r.status_code == 404, r.text

    def test_assign_account_code_other_company(
        self, client, db_session, test_company, other_expense
    ):
        headers = _auth_manager_headers(db_session, test_company)
        r = client.post(
            f"/accounting/work/{other_expense.id}/assign-account-code",
            headers=headers,
            json={"account_code": "1010-gastos"},
        )
        assert r.status_code == 404, r.text

    def test_replace_allocations_other_company(
        self, client, other_expense, caller_headers
    ):
        r = client.put(
            f"/expenses/allocation-edit/{other_expense.id}",
            headers=caller_headers,
            json={"items": []},
        )
        assert r.status_code == 404, r.text


class TestCrossCompanyQueueAccess:
    def test_manager_queue_other_company(
        self, client, db_session, test_company, other_company
    ):
        headers = _auth_manager_headers(db_session, test_company)
        r = client.get(f"/manager/queue/{other_company.id}", headers=headers)
        assert r.status_code == 403

    def test_accounting_queue_other_company(
        self, client, db_session, test_company, other_company
    ):
        headers = _auth_manager_headers(db_session, test_company)
        r = client.get(f"/accounting/queue/{other_company.id}", headers=headers)
        assert r.status_code == 403

    def test_policy_read_other_company(
        self, client, other_company, caller_headers
    ):
        r = client.get(
            f"/expenses/policy/{other_company.id}", headers=caller_headers
        )
        assert r.status_code == 403

    def test_policy_write_other_company(
        self, client, db_session, test_company, other_company
    ):
        headers = _auth_manager_headers(db_session, test_company)
        r = client.put(
            f"/expenses/policy/{other_company.id}",
            headers=headers,
            json={},
        )
        assert r.status_code == 403
