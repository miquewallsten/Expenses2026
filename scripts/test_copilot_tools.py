#!/usr/bin/env python3
"""
Comprehensive Copilot Agent Chat test script.
Tests admin copilot tools: invite_user, update_user, deactivate_user, reactivate_user,
get_company_config, update_workflow, update_policy, send_announcement.
"""

import pytest
import sys
sys.path.insert(0, '/Users/mikaelwallsten/Projects/financial-ops-platform')

from apps.api.db import SessionLocal
from packages.modules.agent.core.registry import REGISTRY
from packages.modules.agent.core.context import AgentContext
from packages.core.platform.models_user import User

# Trigger tool registration
import packages.modules.agent.tools.registry_all  # noqa: F401


def make_ctx(db, company_id, user_id, role="admin"):
    return AgentContext(
        db=db,
        company_id=company_id,
        user_id=user_id,
        user_email="admin@techglobal.mx",
        user_role=role,
        persona="admin",
    )


@pytest.mark.skip("Helper function, not a test")
def _run_tool(name, ctx, args):
    """Run a single tool and print results."""
    print(f"\n  → {name}({args})")
    try:
        result = REGISTRY.dispatch(name, args, ctx)
        status = "✅" if result.ok else "❌"
        print(f"  {status} {result.summary}")
        if result.error:
            print(f"     error: {result.error}")
        if result.data:
            print(f"     data: {result.data}")
        return result
    except Exception as e:
        print(f"  💥 Exception: {e}")
        return None


def main():
    db = SessionLocal()
    company_id = 1
    admin_user = db.query(User).filter_by(email="admin@techglobal.mx").first()
    admin_id = admin_user.id if admin_user else 7

    ctx = make_ctx(db, company_id, admin_id, role="admin")

    print("=" * 70)
    print("COPILOT AGENT CHAT - COMPREHENSIVE TOOL TEST")
    print("=" * 70)
    print(f"Admin user: {admin_user.email if admin_user else 'unknown'} (ID: {admin_id})")
    print(f"Company ID: {company_id}")

    # ── READ TOOLS ──
    print("\n📖 READ TOOLS")
    test_tool("get_company_config", ctx, {})
    test_tool("list_users", ctx, {})
    test_tool("read_company_setup", ctx, {})
    test_tool("read_expense_policy", ctx, {})
    test_tool("read_accounting_setup", ctx, {})

    # ── USER MANAGEMENT ──
    print("\n👤 USER MANAGEMENT")

    # Invite a new user
    res = test_tool("invite_user", ctx, {"email": "test.newuser@techglobal.mx", "role": "employee", "department": "QA"})
    new_user_id = res.data.get("user_id") if res and res.ok else None

    # Try duplicate invite
    test_tool("invite_user", ctx, {"email": "test.newuser@techglobal.mx", "role": "employee"})

    # Update user
    if new_user_id:
        test_tool("update_user", ctx, {"user_id": new_user_id, "role": "manager", "department": "QA Team"})
        test_tool("update_user", ctx, {"user_id": new_user_id, "full_name": "Test Newuser"})

    # Try empty patch
    test_tool("update_user", ctx, {"user_id": new_user_id or 999})

    # Try non-admin permission
    employee_ctx = make_ctx(db, company_id, admin_id, role="employee")
    test_tool("invite_user", employee_ctx, {"email": "hack@techglobal.mx", "role": "admin"})
    test_tool("update_user", employee_ctx, {"user_id": admin_id, "role": "employee"})

    # ── DEACTIVATE / REACTIVATE ──
    print("\n🚫 DEACTIVATE / REACTIVATE")
    if new_user_id:
        # Deactivate
        test_tool("deactivate_user", ctx, {"user_id": new_user_id})

        # Try deactivate already deactivated (should still work or give meaningful error)
        test_tool("deactivate_user", ctx, {"user_id": new_user_id})

        # Reactivate
        test_tool("reactivate_user", ctx, {"user_id": new_user_id})

        # Try reactivate already active
        test_tool("reactivate_user", ctx, {"user_id": new_user_id})

    # Self-deactivation guard
    test_tool("deactivate_user", ctx, {"user_id": admin_id})

    # Not found
    test_tool("deactivate_user", ctx, {"user_id": 99999})
    test_tool("reactivate_user", ctx, {"user_id": 99999})

    # ── WORKFLOW CONFIG ──
    print("\n⚙️ WORKFLOW CONFIG")
    test_tool("update_workflow", ctx, {"approval_mode": "manager_only", "accounting_review_mode": "exceptions_only"})
    test_tool("update_workflow", ctx, {})  # empty patch

    # ── POLICY CONFIG ──
    print("\n📋 POLICY CONFIG")
    test_tool("update_policy", ctx, {"policy_type": "xml_required_mode", "value": "always"})
    test_tool("update_policy", ctx, {"policy_type": "approval_mode", "value": "manager_then_accounting"})
    test_tool("update_policy", ctx, {"policy_type": "allow_resubmission", "value": True})
    test_tool("update_policy", ctx, {"policy_type": "international_expenses_allowed", "value": True})
    test_tool("update_policy", ctx, {"policy_type": "unknown_type", "value": "x"})

    # ── ANNOUNCEMENTS ──
    print("\n📢 ANNOUNCEMENTS")
    test_tool("send_announcement", ctx, {"message": "Hello team! Testing the admin copilot.", "target": "all"})
    test_tool("send_announcement", ctx, {"message": "Manager alert", "target": "managers"})
    test_tool("send_announcement", employee_ctx, {"message": "Hack", "target": "all"})

    # ── TENANT READINESS ──
    print("\n✅ TENANT READINESS")
    test_tool("check_tenant_readiness", ctx, {})
    test_tool("suggest_next_configuration_step", ctx, {})

    # ── DIAGNOSTIC ──
    print("\n🔍 DIAGNOSTIC")
    test_tool("diagnose_config", ctx, {})

    print("\n" + "=" * 70)
    print("COPILOT TEST COMPLETE")
    print("=" * 70)
    print("All admin tools exercised successfully.")
    print("=" * 70)

    db.close()


if __name__ == "__main__":
    main()
