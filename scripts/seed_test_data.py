#!/usr/bin/env python3
"""
Comprehensive seed script for testing the Financial Ops platform.
Creates users, configures company, sets up policies, roles, and add-ons.
"""

import sys
sys.path.insert(0, '/Users/mikaelwallsten/Projects/financial-ops-platform')

from apps.api.db import SessionLocal

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.admin.service.company_setup_service import get_or_create_company_setup
from packages.modules.admin.service.approval_setup_service import get_or_create_approval_setup
from packages.modules.admin.service.accounting_setup_service import get_or_create_accounting_setup
from packages.core.platform.models_expense_policy import CompanyExpensePolicy
from packages.modules.agent.models_definitions import LLMProviderConfig


def seed_all():
    db = SessionLocal()
    try:
        print("=" * 60)
        print("FINANCIAL OPS PLATFORM - COMPREHENSIVE SEED")
        print("=" * 60)

        # ── 1. GET OR CREATE COMPANY ──
        company = db.query(Company).filter_by(id=1).first()
        if not company:
            company = Company(name="TechGlobal México S.A. de C.V.", slug="techglobal-mx", timezone="America/Mexico_City", currency="MXN")
            db.add(company)
            db.commit()
            db.refresh(company)
            print(f"\n[1] Created company: {company.name} (ID: {company.id})")
        else:
            print(f"\n[1] Using existing company: {company.name} (ID: {company.id})")

        company_id = company.id

        # ── 2. CREATE USERS ──
        users_data = [
            {"email": "employee@techglobal.mx", "full_name": "Juan Pérez García", "role": "employee", "department": "Engineering", "job_title": "Software Engineer"},
            {"email": "manager@techglobal.mx", "full_name": "María González López", "role": "manager", "department": "Engineering", "job_title": "Engineering Manager"},
            {"email": "accountant@techglobal.mx", "full_name": "Carlos Rodríguez Hernández", "role": "accountant", "department": "Accounting", "job_title": "Senior Accountant", "is_amex_reconciler": True},
            {"email": "admin@techglobal.mx", "full_name": "Ana Martínez Sánchez", "role": "admin", "department": "Operations", "job_title": "Operations Director"},
        ]

        created_users = []
        for ud in users_data:
            existing = db.query(User).filter_by(email=ud["email"]).first()
            if existing:
                print(f"   User exists: {ud['email']} (ID: {existing.id}, role: {existing.role})")
                created_users.append(existing)
            else:
                user = User(
                    email=ud["email"], full_name=ud["full_name"], role=ud["role"],
                    company_id=company_id, department=ud.get("department"), job_title=ud.get("job_title"),
                    is_active=True, can_create_expenses=True, requires_time_tracking=True,
                    is_amex_reconciler=ud.get("is_amex_reconciler", False),
                )
                db.add(user)
                db.commit()
                db.refresh(user)
                print(f"   Created user: {ud['email']} (ID: {user.id}, role: {user.role})")
                created_users.append(user)

        # ── 3. CONFIGURE COMPANY SETUP ──
        setup = get_or_create_company_setup(db, company_id)
        setup.display_name = "TechGlobal México"
        setup.country_code = "MX"
        setup.base_currency = "MXN"
        setup.timezone = "America/Mexico_City"
        setup.language_code = "es-MX"
        setup.industry = "technology"
        setup.employee_count_range = "51-200"
        setup.has_managers = True
        setup.has_accounting_team = True
        setup.operates_multi_entity = True
        setup.allocation_dimensions = "project,cost_center"
        setup.allow_split_allocations = True
        setup.expenses_module_enabled = True
        setup.time_allocation_module_enabled = True
        setup.approvals_module_enabled = True
        setup.accounting_module_enabled = True
        setup.archive_module_enabled = True
        setup.ai_copilot_enabled = True
        setup.amex_reconciliation_module_enabled = True
        setup.purchase_requests_module_enabled = True
        db.commit()
        print(f"\n[3] Configured company setup: {setup.display_name}")

        # ── 4. CONFIGURE APPROVAL SETUP ──
        approval = get_or_create_approval_setup(db, company_id)
        approval.approval_mode = "manager_then_accounting"
        approval.manager_threshold_amount = 5000.00
        approval.accounting_threshold_amount = 10000.00
        approval.require_manager_for_all_employees = True
        approval.require_accounting_for_all_expenses = True
        approval.allow_self_submission_without_manager = False
        approval.allow_resubmission_after_rejection = True
        approval.escalate_policy_failures_to_accounting = True
        approval.escalate_international_to_accounting = True
        approval.escalate_missing_documents_to_manager = True
        approval.ai_approval_assist_enabled = True
        db.commit()
        print(f"[4] Configured approval: manager_then_accounting, threshold $5,000 MXN")

        # ── 5. CONFIGURE ACCOUNTING SETUP ──
        accounting = get_or_create_accounting_setup(db, company_id)
        accounting.accounting_review_mode = "all"
        accounting.auto_account_suggestion_enabled = True
        accounting.poliza_required = True
        accounting.archive_retention_years = 7
        accounting.cost_center_required = True
        accounting.project_required = True
        accounting.client_required = False
        accounting.allow_accounting_override = True
        accounting.require_final_accounting_review_before_export = True
        accounting.ai_accounting_assist_enabled = True
        db.commit()
        print(f"[5] Configured accounting: review_mode=all, auto_suggestions=ON")

        # ── 6. CONFIGURE EXPENSE POLICY ──
        policy = db.query(CompanyExpensePolicy).filter_by(company_id=company_id).first()
        if not policy:
            policy = CompanyExpensePolicy(company_id=company_id)
            db.add(policy)
        policy.xml_required_mode = "always"
        policy.pdf_pair_required_for_cfdi = True
        policy.international_expenses_allowed = True
        policy.tickets_allowed = True
        policy.require_justification = True
        policy.require_proof = True
        policy.manager_approval_required = True
        policy.accounting_review_required = True
        policy.allow_document_free_expenses = False
        policy.ai_policy_assist_enabled = True
        db.commit()
        print(f"[6] Configured expense policy: XML always required + justification + proof")

        # ── 7. CREATE LLM PROVIDER CONFIG ──
        llm = db.query(LLMProviderConfig).filter_by(company_id=None).first()
        if not llm:
            # Auto-detect Ollama; fall back to generic ollama/llama3.2
            provider = "ollama"
            model_name = "llama3.2"
            base_url = "http://127.0.0.1:11434"
            try:
                import urllib.request
                req = urllib.request.Request("http://127.0.0.1:11434/api/tags", method="GET")
                with urllib.request.urlopen(req, timeout=3.0) as resp:
                    import json
                    models = json.loads(resp.read()).get("models", [])
                    if models:
                        model_name = models[0]["name"]
            except Exception:
                pass
            llm = LLMProviderConfig(company_id=None, provider=provider, model_name=model_name, base_url=base_url, is_active=True)
            db.add(llm)
            db.commit()
            print(f"[7] Created global LLM config: {provider} / {model_name}")
        else:
            print(f"[7] LLM config exists: {llm.provider} / {llm.model_name}")

        # ── SUMMARY ──
        print("\n" + "=" * 60)
        print("SEED COMPLETE!")
        print("=" * 60)
        print(f"Company: {company.name} (ID: {company_id})")
        print(f"Users:")
        for u in created_users:
            print(f"   {u.full_name:30s} {u.email:35s} role={u.role}")
        print(f"\nDepartments: Engineering, Accounting, Operations")
        print(f"Modules enabled: Expenses, Approvals, Accounting, Time Tracking, AMEX, Purchase Requests")
        print(f"Approval mode: manager_then_accounting")
        print(f"Expense policy: XML always required + justification + proof")
        print(f"\nLogin credentials (magic link):")
        print(f"   admin@techglobal.mx (Admin)")
        print(f"   manager@techglobal.mx (Manager)")
        print(f"   accountant@techglobal.mx (Accountant)")
        print(f"   employee@techglobal.mx (Employee)")
        print("=" * 60)

    except Exception as e:
        db.rollback()
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()
    return True


if __name__ == "__main__":
    success = seed_all()
    sys.exit(0 if success else 1)
