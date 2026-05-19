"""
Seed roles, permissions, and user-role assignments.

This script syncs the database Permission table with the PERMISSION_CATALOG
from service_permissions.py, creates default roles per company, and assigns
role-permission mappings based on _BUILTIN_ROLE_DEFAULTS.

Run with: python3 scripts/seed_roles_permissions.py
"""
import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import psycopg2
from packages.core.platform.service_permissions import PERMISSION_CATALOG, _BUILTIN_ROLE_DEFAULTS

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://localhost/financial_ops")

ROLE_LABELS = {
    "admin": "Administrator",
    "manager": "Manager",
    "accounting": "Accountant",
    "employee": "Employee",
    "executive": "Executive",
    "secretary": "Executive Assistant",
}


def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # 1. Sync all permissions from PERMISSION_CATALOG into the DB
    perm_ids = {}
    for key, description in PERMISSION_CATALOG.items():
        cur.execute(
            "INSERT INTO permissions (key, name, description) VALUES (%s, %s, %s) "
            "ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description "
            "RETURNING id",
            (key, key.replace(":", " ").title(), description)
        )
        perm_ids[key] = cur.fetchone()[0]
    conn.commit()
    print(f"Synced {len(perm_ids)} permissions from PERMISSION_CATALOG")

    # 2. Seed roles per company
    cur.execute("SELECT id FROM companies")
    companies = [r[0] for r in cur.fetchall()]

    for company_id in companies:
        role_ids = {}
        for role_key, role_name in ROLE_LABELS.items():
            cur.execute(
                "INSERT INTO roles (company_id, key, name) VALUES (%s, %s, %s) "
                "ON CONFLICT (company_id, key) DO UPDATE SET name = EXCLUDED.name "
                "RETURNING id",
                (company_id, role_key, role_name)
            )
            role_ids[role_key] = cur.fetchone()[0]

        # 3. Seed role_permissions from _BUILTIN_ROLE_DEFAULTS
        for role_key, perm_keys in _BUILTIN_ROLE_DEFAULTS.items():
            if role_key in ("admin", "super_admin", "disabled"):
                # admin/super_admin get ALL permissions, disabled gets none
                keys_to_assign = perm_keys if role_key == "admin" else set()
            else:
                keys_to_assign = perm_keys
            role_id = role_ids.get(role_key)
            if role_id is None:
                continue
            for perm_key in keys_to_assign:
                if perm_key in perm_ids:
                    cur.execute(
                        "INSERT INTO role_permissions (role_id, permission_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                        (role_id, perm_ids[perm_key])
                    )

        # 4. Assign users to their roles based on their `role` column
        cur.execute("SELECT id, role FROM users WHERE company_id = %s", (company_id,))
        users = cur.fetchall()
        for user_id, user_role in users:
            if user_role in role_ids:
                cur.execute(
                    "INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                    (user_id, role_ids[user_role])
                )

    conn.commit()
    print(f"Seeded roles, permissions, and user-role assignments for {len(companies)} companies")

    # 5. Set user capabilities
    cur.execute("UPDATE users SET can_access_accounting = true WHERE role IN ('accounting', 'admin')")
    cur.execute("UPDATE users SET can_create_expenses = true WHERE can_create_expenses IS NULL")
    cur.execute("UPDATE users SET can_view_analytics = true WHERE role IN ('admin', 'executive', 'manager')")
    conn.commit()
    print("Updated user capabilities")

    cur.close()
    conn.close()
    print("Done!")


if __name__ == "__main__":
    main()
