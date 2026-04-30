from __future__ import annotations

from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_user import User


MODULE_REGISTRY: dict[str, dict] = {
    "expenses": {
        "label": "Expenses",
        "required_roles": {"employee", "manager", "accounting"},
    },
    "approvals": {
        "label": "Approvals",
        "required_roles": {"manager"},
    },
    "accounting": {
        "label": "Accounting",
        "required_roles": {"accounting"},
    },
    "time": {
        "label": "Time Tracking",
        "required_roles": {"employee", "manager"},
    },
    "reports": {
        "label": "Reports",
        "required_roles": {"employee", "manager", "accounting"},
    },
    "admin": {
        "label": "Admin",
        "required_roles": {"admin"},
    },
    "super-admin": {
        "label": "Super Admin",
        "required_roles": {"super_admin"},
    },
}

AGENT_ID_MAP: dict[str, str] = {
    "employee": "employee-copilot",
    "manager": "manager-copilot",
    "accounting": "accounting-copilot",
    "admin": "admin-copilot",
    "super_admin": "super-admin-copilot",
}

TOOL_PERMISSIONS: list[str] = [
    "expenses:create",
    "approval:approve",
    "user:invite",
    "policy:update",
    "workflow:manage",
    "announcement:send",
]


class ManifestService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def build_manifest(self, user_id: int) -> dict:
        user = self.db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise ValueError("User not found")

        company = self.db.query(Company).filter(Company.id == user.company_id).first()

        user_role = user.role or "employee"
        is_super_admin = bool(user.is_super_admin)

        # Determine visible modules
        modules: list[dict] = []
        if is_super_admin:
            for mod_id, mod_meta in MODULE_REGISTRY.items():
                modules.append({"id": mod_id, "label": mod_meta["label"]})
        elif user_role == "admin":
            modules.append({"id": "admin", "label": MODULE_REGISTRY["admin"]["label"]})
        else:
            for mod_id, mod_meta in MODULE_REGISTRY.items():
                if user_role in mod_meta["required_roles"]:
                    modules.append({"id": mod_id, "label": mod_meta["label"]})

        # Determine permissions based on user fields and role
        permissions: set[str] = set()
        if user.can_create_expenses:
            permissions.add("expenses:create")
        if user_role == "manager":
            permissions.add("approval:approve")
        if user_role == "admin":
            permissions.update([
                "user:invite",
                "policy:update",
                "workflow:manage",
                "announcement:send",
            ])
        if is_super_admin:
            permissions.update(TOOL_PERMISSIONS)

        agent_id = AGENT_ID_MAP.get(user_role, "employee-copilot")

        manifest = {
            "user": {
                "id": user.id,
                "email": user.email,
                "fullName": user.full_name,
                "role": user_role,
                "isSuperAdmin": is_super_admin,
            },
            "permissions": sorted(list(permissions)),
            "modules": modules,
            "copilot": {
                "agentId": agent_id,
            },
            "tenant": {
                "companyId": company.id if company else user.company_id,
                "companyName": company.name if company else None,
            },
        }

        return manifest
