from __future__ import annotations

from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.schemas.expense import ExpenseCreate
from packages.modules.expenses.service.expense_service import create_expense
from packages.modules.mywork.core.action_router import route_action


def test_route_action_expenses_create(db_session: Session) -> None:
    company = Company(name="Create Co", slug="create-co")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)

    user = User(
        full_name="Create User",
        email="create@test.com",
        role="employee",
        company_id=company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    result = route_action(
        action_id="expenses:create",
        module="expenses",
        payload={"amount": 50.0, "description": "Coffee", "company_id": company.id},
        context=None,
        db=db_session,
        user=user,
    )
    assert result["success"] is True
    assert "expense_id" in result["data"]
    assert result["data"]["status"] == "draft"


def test_route_action_expenses_submit(db_session: Session) -> None:
    company = Company(name="Submit Co", slug="submit-co")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)

    user = User(
        full_name="Submit User",
        email="submit@test.com",
        role="employee",
        company_id=company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    expense = create_expense(
        db_session,
        ExpenseCreate(company_id=company.id, amount=75.0, description="Lunch"),
    )

    result = route_action(
        action_id="expenses:submit",
        module="expenses",
        payload={"expense_id": expense.id},
        context=None,
        db=db_session,
        user=user,
    )
    assert result["success"] is True
    assert result["data"]["status"] == "submitted"


def test_route_action_expenses_submit_missing_param(db_session: Session) -> None:
    company = Company(name="Missing Co", slug="missing-co")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)

    user = User(
        full_name="Missing User",
        email="missing@test.com",
        role="employee",
        company_id=company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    result = route_action(
        action_id="expenses:submit",
        module="expenses",
        payload={},
        context=None,
        db=db_session,
        user=user,
    )
    assert result["success"] is False
    assert result["error"]["code"] == "missing_param"


def test_route_action_approvals_approve(db_session: Session) -> None:
    company = Company(name="Approve Co", slug="approve-co")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)

    user = User(
        full_name="Approve User",
        email="approve@test.com",
        role="manager",
        company_id=company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    expense = create_expense(
        db_session,
        ExpenseCreate(company_id=company.id, amount=200.0, description="Hotel"),
    )
    # Move to submitted first
    from packages.modules.expenses.service.expense_service import submit_expense
    submit_expense(db_session, expense.id)

    result = route_action(
        action_id="approvals:approve",
        module="approvals",
        payload={"expense_id": expense.id},
        context=None,
        db=db_session,
        user=user,
    )
    assert result["success"] is True
    assert result["data"]["status"] == "approved"


def test_route_action_approvals_reject(db_session: Session) -> None:
    company = Company(name="Reject Co", slug="reject-co")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)

    user = User(
        full_name="Reject User",
        email="reject@test.com",
        role="manager",
        company_id=company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    expense = create_expense(
        db_session,
        ExpenseCreate(company_id=company.id, amount=50.0, description="Taxi"),
    )
    from packages.modules.expenses.service.expense_service import submit_expense
    submit_expense(db_session, expense.id)

    result = route_action(
        action_id="approvals:reject",
        module="approvals",
        payload={"expense_id": expense.id},
        context=None,
        db=db_session,
        user=user,
    )
    assert result["success"] is True
    assert result["data"]["status"] == "rejected"


def test_route_action_users_create(db_session: Session) -> None:
    company = Company(name="User Co", slug="user-co")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)

    user = User(
        full_name="Admin User",
        email="admin@test.com",
        role="admin",
        company_id=company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    result = route_action(
        action_id="users:create",
        module="users",
        payload={"email": "new@user.com", "full_name": "New User", "role": "employee"},
        context=None,
        db=db_session,
        user=user,
    )
    assert result["success"] is True
    assert result["data"]["email"] == "new@user.com"


def test_route_action_users_invite(db_session: Session) -> None:
    company = Company(name="Invite Co", slug="invite-co")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)

    user = User(
        full_name="Invite User",
        email="invite@test.com",
        role="admin",
        company_id=company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    result = route_action(
        action_id="users:invite",
        module="users",
        payload={"email": "invited@test.com"},
        context=None,
        db=db_session,
        user=user,
    )
    assert result["success"] is True
    assert result["data"]["invited_email"] == "invited@test.com"


def test_route_action_policy_update(db_session: Session) -> None:
    company = Company(name="Policy Co", slug="policy-co")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)

    user = User(
        full_name="Policy User",
        email="policy@test.com",
        role="admin",
        company_id=company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    result = route_action(
        action_id="policy:update",
        module="admin",
        payload={"max_amount": 1000, "currency": "MXN"},
        context=None,
        db=db_session,
        user=user,
    )
    assert result["success"] is True
    assert result["data"]["policy_updated"] is True
    assert "max_amount" in result["data"]["fields"]


def test_route_action_announcement_send(db_session: Session) -> None:
    company = Company(name="Announce Co", slug="announce-co")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)

    user = User(
        full_name="Announce User",
        email="announce@test.com",
        role="admin",
        company_id=company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    result = route_action(
        action_id="announcement:send",
        module="admin",
        payload={"title": "All-hands meeting", "body": "Tomorrow at 10am"},
        context=None,
        db=db_session,
        user=user,
    )
    assert result["success"] is True
    assert result["data"]["announcement_sent"] is True
    assert result["data"]["title"] == "All-hands meeting"


def test_route_action_unknown_action(db_session: Session) -> None:
    company = Company(name="Unknown Co", slug="unknown-co")
    db_session.add(company)
    db_session.commit()
    db_session.refresh(company)

    user = User(
        full_name="Unknown User",
        email="unknown@test.com",
        role="employee",
        company_id=company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    result = route_action(
        action_id="unknown:action",
        module="expenses",
        payload={},
        context=None,
        db=db_session,
        user=user,
    )
    assert result["success"] is False
    assert result["error"]["code"] == "unknown_action"
    assert result["error"]["retryable"] is False
