from apps.api.db import SessionLocal
from packages.core.platform.schemas_module import PlatformModuleCreate
from packages.core.platform.service_module import create_platform_module

MODULES = [
    PlatformModuleCreate(
        key="expenses",
        name="Expenses",
        description="Employee expense submission, CFDI validation, and manager approval workflows.",
        is_core=True,
    ),
    PlatformModuleCreate(
        key="time_allocation",
        name="Time Allocation",
        description="Track employee time against projects and cost centers for internal reporting.",
        is_core=False,
    ),
    PlatformModuleCreate(
        key="requests",
        name="Requests",
        description="Structured purchase and service request workflows with approval routing.",
        is_core=False,
    ),
    PlatformModuleCreate(
        key="accounting",
        name="Accounting",
        description="Poliza generation, GL mapping, and period-close tools for accounting teams.",
        is_core=False,
    ),
    PlatformModuleCreate(
        key="approvals",
        name="Approvals",
        description="Cross-module approval queue for managers and finance leads.",
        is_core=True,
    ),
    PlatformModuleCreate(
        key="settings",
        name="Settings",
        description="User preferences, localization, notifications, and AI behavior configuration.",
        is_core=True,
    ),
    PlatformModuleCreate(
        key="ai_setup_studio",
        name="AI Setup Studio",
        description="Configure AI-assisted workflows, inference rules, and Copilot behavior.",
        is_core=False,
    ),
]


def main() -> None:
    db = SessionLocal()
    try:
        for payload in MODULES:
            try:
                create_platform_module(db, payload)
                print(f"  [seeded] {payload.key}")
            except ValueError:
                print(f"  [exists] {payload.key}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
