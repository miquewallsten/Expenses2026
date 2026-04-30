"""Regression tests verifying old portal routes redirect to the unified MyWork portal."""
from __future__ import annotations

from pathlib import Path

import pytest

WEB_APP = Path(__file__).resolve().parents[3] / "web" / "app"


def _read_page(path: Path) -> str:
    if not path.exists():
        pytest.fail(f"Page not found: {path}")
    return path.read_text()


class TestEmployeeRedirect:
    def test_employee_page_redirects_to_mywork_expenses(self) -> None:
        src = _read_page(WEB_APP / "employee" / "page.tsx")
        assert 'redirect("/mywork?module=expenses")' in src


class TestManagerRedirect:
    def test_manager_page_redirects_to_mywork_approvals(self) -> None:
        src = _read_page(WEB_APP / "manager" / "page.tsx")
        assert 'redirect("/mywork?module=approvals")' in src


class TestAccountingRedirect:
    def test_accounting_page_redirects_to_mywork_accounting(self) -> None:
        src = _read_page(WEB_APP / "accounting" / "page.tsx")
        assert 'redirect("/mywork?module=accounting")' in src


class TestAdminRedirect:
    def test_admin_page_redirects_to_mywork_admin(self) -> None:
        src = _read_page(WEB_APP / "admin" / "page.tsx")
        assert 'redirect("/mywork?module=admin")' in src


class TestRootRedirect:
    def test_root_page_redirects_to_mywork(self) -> None:
        src = _read_page(WEB_APP / "page.tsx")
        assert 'redirect("/mywork")' in src
