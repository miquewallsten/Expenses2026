"""Admin copilot tools — user management, policy, workflow, announcements.

Each tool validates admin permissions before executing and returns a
structured ``ToolResult``.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from packages.core.platform.models_user import User
from packages.core.platform.models_company_setup import CompanySetup
from packages.core.platform.models_approval_setup import ApprovalSetup
from packages.core.platform.models_accounting_setup import AccountingSetup
from packages.core.platform.models_expense_policy import CompanyExpensePolicy

from packages.modules.admin.service.company_setup_service import get_or_create_company_setup
from packages.modules.admin.service.approval_setup_service import get_or_create_approval_setup
from packages.modules.admin.service.accounting_setup_service import get_or_create_accounting_setup

from ..core.context import AgentContext
from ..core.notification_service import NOTIFICATION_SERVICE
from ..core.registry import REGISTRY, ToolResult, ToolSpec
from ._common import diff_row, non_null


# ── invite_user ──────────────────────────────────────────────────────────────

class InviteUserArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email:      str = Field(..., min_length=3, max_length=255)
    role:       str = Field(default="employee", pattern=r"^(employee|manager|accountant|admin)$")
    department: str | None = Field(default=None, max_length=100)


def _handle_invite_user(ctx: AgentContext, args: InviteUserArgs) -> ToolResult:
    if ctx.user_role != "admin":
        return ToolResult(
            ok=False,
            summary="invite_user requires admin role",
            error="forbidden",
        )

    existing = (
        ctx.db.query(User)
        .filter(User.email == args.email)
        .one_or_none()
    )
    if existing:
        return ToolResult(
            ok=False,
            summary=f"User with email {args.email} already exists",
            error="duplicate_email",
        )

    new_user = User(
        email=args.email,
        full_name=args.email.split("@")[0],
        role=args.role,
        company_id=ctx.company_id,
        department=args.department,
    )
    ctx.db.add(new_user)
    ctx.db.commit()
    ctx.db.refresh(new_user)

    return ToolResult(
        ok=True,
        summary=f"Invited {args.email} as {args.role}",
        data={"user_id": new_user.id, "email": new_user.email, "role": new_user.role},
    )


REGISTRY.register(ToolSpec(
    name="invite_user",
    description="Invita a un nuevo usuario por email, rol y departamento.",
    category="config",
    input_schema=InviteUserArgs,
    handler=_handle_invite_user,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
))


# ── update_policy ─────────────────────────────────────────────────────────────

class UpdatePolicyArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    policy_type: str = Field(..., pattern=r"^(xml_required_mode|approval_mode|allow_resubmission|international_expenses_allowed)$")
    value:       Any


def _handle_update_policy(ctx: AgentContext, args: UpdatePolicyArgs) -> ToolResult:
    if ctx.user_role != "admin":
        return ToolResult(
            ok=False,
            summary="update_policy requires admin role",
            error="forbidden",
        )

    policy = get_or_create_approval_setup(ctx.db, ctx.company_id)
    expense_policy = (
        ctx.db.query(CompanyExpensePolicy)
        .filter(CompanyExpensePolicy.company_id == ctx.company_id)
        .first()
    )

    if args.policy_type == "xml_required_mode":
        mode = str(args.value)
        if expense_policy is None:
            expense_policy = CompanyExpensePolicy(company_id=ctx.company_id, xml_required_mode=mode)
            ctx.db.add(expense_policy)
        else:
            expense_policy.xml_required_mode = mode
        ctx.db.commit()
        return ToolResult(ok=True, summary=f"XML required mode set to {mode}", data={"xml_required_mode": mode})

    if args.policy_type == "international_expenses_allowed":
        val = bool(args.value)
        if expense_policy is None:
            expense_policy = CompanyExpensePolicy(company_id=ctx.company_id, international_expenses_allowed=val)
            ctx.db.add(expense_policy)
        else:
            expense_policy.international_expenses_allowed = val
        ctx.db.commit()
        return ToolResult(ok=True, summary=f"International expenses allowed set to {val}", data={"international_expenses_allowed": val})

    if args.policy_type == "approval_mode":
        mode = str(args.value)
        policy.approval_mode = mode
        ctx.db.commit()
        return ToolResult(ok=True, summary=f"Approval mode set to {mode}", data={"approval_mode": mode})

    if args.policy_type == "allow_resubmission":
        val = bool(args.value)
        policy.allow_resubmission_after_rejection = val
        ctx.db.commit()
        return ToolResult(ok=True, summary=f"Resubmission policy set to {val}", data={"allow_resubmission": val})

    return ToolResult(ok=False, summary="Unknown policy type", error="unknown_policy_type")


REGISTRY.register(ToolSpec(
    name="update_policy",
    description="Actualiza la política de gastos (límite, modo de aprobación, reenvío).",
    category="config",
    input_schema=UpdatePolicyArgs,
    handler=_handle_update_policy,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
))


# ── send_announcement ────────────────────────────────────────────────────────

class SendAnnouncementArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(..., min_length=1, max_length=2000)
    target:  str = Field(default="all", pattern=r"^(all|employees|managers|accounting)$")


def _handle_send_announcement(ctx: AgentContext, args: SendAnnouncementArgs) -> ToolResult:
    if ctx.user_role != "admin":
        return ToolResult(
            ok=False,
            summary="send_announcement requires admin role",
            error="forbidden",
        )

    ann = NOTIFICATION_SERVICE.send_announcement(
        company_id=ctx.company_id,
        title="Agent Announcement",
        message=args.message,
        target_roles=[args.target],
        channels=["mywork"],
    )
    return ToolResult(
        ok=True,
        summary=f"Announcement sent to {args.target}",
        data={"announcement_id": ann.id},
    )


REGISTRY.register(ToolSpec(
    name="send_announcement",
    description="Envía un anuncio a todos los usuarios o a un rol específico.",
    category="config",
    input_schema=SendAnnouncementArgs,
    handler=_handle_send_announcement,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
))


# ── get_company_config ───────────────────────────────────────────────────────

class Empty(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _handle_get_company_config(ctx: AgentContext, _: Empty) -> ToolResult:
    if ctx.user_role != "admin":
        return ToolResult(
            ok=False,
            summary="get_company_config requires admin role",
            error="forbidden",
        )

    setup = get_or_create_company_setup(ctx.db, ctx.company_id)
    approval = get_or_create_approval_setup(ctx.db, ctx.company_id)
    accounting = get_or_create_accounting_setup(ctx.db, ctx.company_id)

    return ToolResult(
        ok=True,
        summary="Current company configuration",
        data={
            "company_setup": {
                "display_name": setup.display_name,
                "base_currency": setup.base_currency,
                "timezone": setup.timezone,
                "language_code": setup.language_code,
                "has_managers": setup.has_managers,
            },
            "approval_setup": {
                "approval_mode": approval.approval_mode,
                "require_manager_for_all_employees": approval.require_manager_for_all_employees,
                "allow_resubmission_after_rejection": approval.allow_resubmission_after_rejection,
            },
            "accounting_setup": {
                "accounting_review_mode": accounting.accounting_review_mode,
                "auto_account_suggestion_enabled": accounting.auto_account_suggestion_enabled,
            },
        },
    )


REGISTRY.register(ToolSpec(
    name="get_company_config",
    description="Devuelve la configuración actual de la empresa (company, approval, accounting).",
    category="read",
    input_schema=Empty,
    handler=_handle_get_company_config,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
))


# ── update_workflow ───────────────────────────────────────────────────────────

class UpdateWorkflowArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    approval_mode: str | None = Field(default=None, pattern=r"^(none|manager_only|manager_then_accounting|accounting_only|threshold_based)$")
    require_manager_for_all_employees: bool | None = None
    accounting_review_mode: str | None = Field(default=None, pattern=r"^(all|exceptions_only|none)$")
    auto_account_suggestion_enabled: bool | None = None


def _handle_update_workflow(ctx: AgentContext, args: UpdateWorkflowArgs) -> ToolResult:
    if ctx.user_role != "admin":
        return ToolResult(
            ok=False,
            summary="update_workflow requires admin role",
            error="forbidden",
        )

    approval = get_or_create_approval_setup(ctx.db, ctx.company_id)
    accounting = get_or_create_accounting_setup(ctx.db, ctx.company_id)

    patch = non_null(args)
    if not patch:
        return ToolResult(ok=False, summary="No workflow changes provided", error="empty_patch")

    changes: dict[str, Any] = {}

    if args.approval_mode is not None:
        approval.approval_mode = args.approval_mode
        changes["approval_mode"] = args.approval_mode

    if args.require_manager_for_all_employees is not None:
        approval.require_manager_for_all_employees = args.require_manager_for_all_employees
        changes["require_manager_for_all_employees"] = args.require_manager_for_all_employees

    if args.accounting_review_mode is not None:
        accounting.accounting_review_mode = args.accounting_review_mode
        changes["accounting_review_mode"] = args.accounting_review_mode

    if args.auto_account_suggestion_enabled is not None:
        accounting.auto_account_suggestion_enabled = args.auto_account_suggestion_enabled
        changes["auto_account_suggestion_enabled"] = args.auto_account_suggestion_enabled

    ctx.db.commit()

    return ToolResult(
        ok=True,
        summary=f"Workflow updated: {', '.join(changes.keys())}",
        data={"changes": changes},
    )


REGISTRY.register(ToolSpec(
    name="update_workflow",
    description="Modifica el flujo de aprobación y revisión contable.",
    category="config",
    input_schema=UpdateWorkflowArgs,
    handler=_handle_update_workflow,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
))


# ── update_user ──────────────────────────────────────────────────────────────

class UpdateUserArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id:    int
    role:       str | None = Field(default=None, pattern=r"^(employee|manager|accountant|admin)$")
    department: str | None = Field(default=None, max_length=100)
    full_name:  str | None = Field(default=None, max_length=255)


def _handle_update_user(ctx: AgentContext, args: UpdateUserArgs) -> ToolResult:
    if ctx.user_role != "admin":
        return ToolResult(ok=False, summary="update_user requires admin role", error="forbidden")

    user = (
        ctx.db.query(User)
        .filter(User.id == args.user_id, User.company_id == ctx.company_id)
        .one_or_none()
    )
    if not user:
        return ToolResult(ok=False, summary=f"User {args.user_id} not found", error="not_found")

    changes: dict[str, Any] = {}
    if args.role is not None:
        user.role = args.role
        changes["role"] = args.role
    if args.department is not None:
        user.department = args.department
        changes["department"] = args.department
    if args.full_name is not None:
        user.full_name = args.full_name
        changes["full_name"] = args.full_name

    if not changes:
        return ToolResult(ok=False, summary="No changes provided", error="empty_patch")

    ctx.db.commit()
    return ToolResult(
        ok=True,
        summary=f"Updated user {user.email}: {', '.join(changes.keys())}",
        data={"user_id": user.id, "changes": changes},
    )


REGISTRY.register(ToolSpec(
    name="update_user",
    description="Modifica el rol, departamento o nombre de un usuario existente.",
    category="config",
    input_schema=UpdateUserArgs,
    handler=_handle_update_user,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
))


# ── deactivate_user ────────────────────────────────────────────────────────────

class DeactivateUserArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: int


def _handle_deactivate_user(ctx: AgentContext, args: DeactivateUserArgs) -> ToolResult:
    if ctx.user_role != "admin":
        return ToolResult(ok=False, summary="deactivate_user requires admin role", error="forbidden")

    user = (
        ctx.db.query(User)
        .filter(User.id == args.user_id, User.company_id == ctx.company_id)
        .one_or_none()
    )
    if not user:
        return ToolResult(ok=False, summary=f"User {args.user_id} not found", error="not_found")

    # Prevent self-deactivation
    if user.id == ctx.user_id:
        return ToolResult(ok=False, summary="Cannot deactivate yourself", error="self_deactivation")

    user.is_active = False
    ctx.db.commit()
    return ToolResult(
        ok=True,
        summary=f"Deactivated user {user.email}",
        data={"user_id": user.id, "email": user.email},
    )


REGISTRY.register(ToolSpec(
    name="deactivate_user",
    description="Desactiva un usuario (no elimina datos históricos).",
    category="config",
    input_schema=DeactivateUserArgs,
    handler=_handle_deactivate_user,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
    destructive=True,
))


# ── reactivate_user ────────────────────────────────────────────────────────────

class ReactivateUserArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: int


def _handle_reactivate_user(ctx: AgentContext, args: ReactivateUserArgs) -> ToolResult:
    if ctx.user_role != "admin":
        return ToolResult(ok=False, summary="reactivate_user requires admin role", error="forbidden")

    user = (
        ctx.db.query(User)
        .filter(User.id == args.user_id, User.company_id == ctx.company_id)
        .one_or_none()
    )
    if not user:
        return ToolResult(ok=False, summary=f"User {args.user_id} not found", error="not_found")

    if user.is_active:
        return ToolResult(ok=False, summary=f"User {user.email} is already active", error="already_active")

    user.is_active = True
    ctx.db.commit()
    return ToolResult(
        ok=True,
        summary=f"Reactivated user {user.email}",
        data={"user_id": user.id, "email": user.email},
    )


REGISTRY.register(ToolSpec(
    name="reactivate_user",
    description="Reactiva un usuario previamente desactivado.",
    category="config",
    input_schema=ReactivateUserArgs,
    handler=_handle_reactivate_user,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
    destructive=True,
))


# ── list_users ──────────────────────────────────────────────────────────────

VALID_ROLES = ("employee", "manager", "accountant", "admin", "executive", "secretary")

VALID_CAPABILITIES = (
    "can_create_expenses",
    "can_create_corporate_expenses",
    "can_invoice_corporation",
    "is_amex_reconciler",
    "requires_time_tracking",
    "has_executive_reporting",
    "can_access_accounting",
    "can_view_analytics",
)


class ListUsersArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    search: str | None = None
    roles: list[str] | None = None
    legal_entity_id: int | None = None
    capabilities: list[str] | None = None
    is_active: bool | None = None
    has_delegation: bool | None = None
    group_by: str | None = None
    include_metrics: bool = False
    limit: int = Field(default=100, ge=1, le=1000)
    offset: int = Field(default=0, ge=0)


def _handle_list_users(ctx: AgentContext, args: ListUsersArgs) -> ToolResult:
    if ctx.user_role != "admin":
        return ToolResult(
            ok=False,
            summary="list_users requires admin role",
            error="forbidden",
        )

    # Validate roles
    if args.roles:
        invalid = set(args.roles) - set(VALID_ROLES)
        if invalid:
            return ToolResult(
                ok=False,
                summary=f"Invalid roles: {invalid}",
                error="invalid_roles",
            )

    # Validate capabilities
    if args.capabilities:
        invalid = set(args.capabilities) - set(VALID_CAPABILITIES)
        if invalid:
            return ToolResult(
                ok=False,
                summary=f"Invalid capabilities: {invalid}",
                error="invalid_capabilities",
            )

    query = ctx.db.query(User).filter(User.company_id == ctx.company_id)

    # Apply filters
    if args.search:
        search_term = f"%{args.search}%"
        query = query.filter(
            (User.full_name.ilike(search_term)) |
            (User.email.ilike(search_term)) |
            (User.department.ilike(search_term))
        )

    if args.roles:
        query = query.filter(User.role.in_(args.roles))

    if args.legal_entity_id:
        query = query.filter(User.legal_entity_id == args.legal_entity_id)

    if args.is_active is not None:
        query = query.filter(User.is_active == args.is_active)

    if args.has_delegation is not None:
        if args.has_delegation:
            query = query.filter(User.delegates_for_user_id.isnot(None))
        else:
            query = query.filter(User.delegates_for_user_id.is_(None))

    if args.capabilities:
        for cap in args.capabilities:
            if hasattr(User, cap):
                query = query.filter(getattr(User, cap) == True)

    users = query.order_by(User.full_name).offset(args.offset).limit(args.limit).all()

    # Build result
    user_list = []
    for u in users:
        user_data = {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
            "department": u.department,
            "legal_entity_id": u.legal_entity_id,
            "delegates_for_user_id": u.delegates_for_user_id,
            "capabilities": {
                "can_create_expenses": u.can_create_expenses,
                "can_create_corporate_expenses": u.can_create_corporate_expenses,
                "can_invoice_corporation": u.can_invoice_corporation,
                "is_amex_reconciler": u.is_amex_reconciler,
                "requires_time_tracking": u.requires_time_tracking,
                "has_executive_reporting": u.has_executive_reporting,
                "can_access_accounting": u.can_access_accounting,
                "can_view_analytics": u.can_view_analytics,
            },
        }

        if args.include_metrics:
            user_data["last_login_at"] = u.last_login_at.isoformat() if u.last_login_at else None
            user_data["created_at"] = u.created_at.isoformat() if u.created_at else None
            # TODO(Phase 2): expense_count should join with expenses table to return actual count.
            # Currently returns 0 as placeholder. Implement by adding subquery counting expenses
            # where user_id matches and expense is in a non-deleted state.
            user_data["expense_count"] = 0

        user_list.append(user_data)

    # Grouping
    grouped = None
    if args.group_by:
        grouped = {}
        for u in user_list:
            key = u.get(args.group_by, "unknown")
            if key not in grouped:
                grouped[key] = []
            grouped[key].append(u)

    result_data = {"users": user_list}
    if grouped:
        result_data["grouped"] = grouped

    return ToolResult(
        ok=True,
        summary=f"Found {len(user_list)} users",
        data=result_data,
    )


REGISTRY.register(ToolSpec(
    name="list_users",
    description="Lista usuarios con filtros, agrupación y métricas opcionales.",
    category="read",
    input_schema=ListUsersArgs,
    handler=_handle_list_users,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
))


# ── get_user_permissions ──────────────────────────────────────────────────────

CAPABILITY_EXPLANATIONS = {
    "can_create_expenses": "Can create and submit expense reports",
    "can_create_corporate_expenses": "Can create corporate card expenses",
    "can_invoice_corporation": "Can invoice on behalf of the corporation",
    "is_amex_reconciler": "Can reconcile AMEX statements",
    "requires_time_tracking": "Must track time on projects",
    "has_executive_reporting": "Can access executive analytics dashboard",
    "can_access_accounting": "Can access accounting review queue",
    "can_view_analytics": "Can view finance analytics",
}

ROLE_PRESETS = {
    "employee": {
        "can_create_expenses": True,
        "can_create_corporate_expenses": False,
        "can_invoice_corporation": False,
        "is_amex_reconciler": False,
        "requires_time_tracking": False,
        "has_executive_reporting": False,
        "can_access_accounting": False,
        "can_view_analytics": False,
    },
    "manager": {
        "can_create_expenses": True,
        "can_create_corporate_expenses": False,
        "can_invoice_corporation": False,
        "is_amex_reconciler": False,
        "requires_time_tracking": False,
        "has_executive_reporting": False,
        "can_access_accounting": False,
        "can_view_analytics": False,
    },
    "accountant": {
        "can_create_expenses": False,
        "can_create_corporate_expenses": False,
        "can_invoice_corporation": False,
        "is_amex_reconciler": False,
        "requires_time_tracking": False,
        "has_executive_reporting": False,
        "can_access_accounting": True,
        "can_view_analytics": True,
    },
    "admin": {
        "can_create_expenses": False,
        "can_create_corporate_expenses": False,
        "can_invoice_corporation": False,
        "is_amex_reconciler": False,
        "requires_time_tracking": False,
        "has_executive_reporting": False,
        "can_access_accounting": False,
        "can_view_analytics": False,
    },
    "executive": {
        "can_create_expenses": True,
        "can_create_corporate_expenses": False,
        "can_invoice_corporation": False,
        "is_amex_reconciler": False,
        "requires_time_tracking": False,
        "has_executive_reporting": True,
        "can_access_accounting": False,
        "can_view_analytics": False,
    },
    "secretary": {
        "can_create_expenses": True,
        "can_create_corporate_expenses": False,
        "can_invoice_corporation": False,
        "is_amex_reconciler": False,
        "requires_time_tracking": False,
        "has_executive_reporting": False,
        "can_access_accounting": False,
        "can_view_analytics": False,
    },
}


def compute_module_visibility(role: str, capabilities: dict, company_modules: dict) -> dict:
    """Compute which modules a user can see."""
    visibility = {}

    # My Expenses: requires can_create_expenses AND expenses module
    visibility["my_expenses"] = (
        capabilities.get("can_create_expenses", True) and
        company_modules.get("expenses_module_enabled", True)
    )

    # Accounting Review: requires accounting role OR can_access_accounting
    visibility["accounting_review"] = (
        role == "accountant" or
        capabilities.get("can_access_accounting", False)
    ) and company_modules.get("accounting_module_enabled", True)

    # Finance Analytics: requires accounting/executive role OR can_view_analytics
    visibility["finance_analytics"] = (
        role in ("accountant", "executive") or
        capabilities.get("can_view_analytics", False)
    )

    # My Approvals: requires manager role
    visibility["my_approvals"] = (
        role == "manager" and
        company_modules.get("approvals_module_enabled", True)
    )

    return visibility


class GetUserPermissionsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: int


def _handle_get_user_permissions(ctx: AgentContext, args: GetUserPermissionsArgs) -> ToolResult:
    if ctx.user_role != "admin":
        return ToolResult(
            ok=False,
            summary="get_user_permissions requires admin role",
            error="forbidden",
        )

    user = (
        ctx.db.query(User)
        .filter(User.id == args.user_id, User.company_id == ctx.company_id)
        .one_or_none()
    )

    if not user:
        return ToolResult(
            ok=False,
            summary=f"User {args.user_id} not found",
            error="not_found",
        )

    capabilities = {
        "can_create_expenses": user.can_create_expenses,
        "can_create_corporate_expenses": user.can_create_corporate_expenses,
        "can_invoice_corporation": user.can_invoice_corporation,
        "is_amex_reconciler": user.is_amex_reconciler,
        "requires_time_tracking": user.requires_time_tracking,
        "has_executive_reporting": user.has_executive_reporting,
        "can_access_accounting": user.can_access_accounting,
        "can_view_analytics": user.can_view_analytics,
    }

    # Get company modules
    setup = (
        ctx.db.query(CompanySetup)
        .filter(CompanySetup.company_id == ctx.company_id)
        .first()
    )
    company_modules = {
        "expenses_module_enabled": setup.expenses_module_enabled if setup else True,
        "accounting_module_enabled": setup.accounting_module_enabled if setup else True,
        "approvals_module_enabled": setup.approvals_module_enabled if setup else True,
        "time_allocation_module_enabled": setup.time_allocation_module_enabled if setup else False,
        "amex_reconciliation_module_enabled": setup.amex_reconciliation_module_enabled if setup else False,
    }

    module_visibility = compute_module_visibility(user.role, capabilities, company_modules)

    # Get delegation info
    delegates_for_user = None
    if user.delegates_for_user_id:
        boss = ctx.db.query(User).filter(User.id == user.delegates_for_user_id).first()
        if boss:
            delegates_for_user = {"id": boss.id, "name": boss.full_name}

    return ToolResult(
        ok=True,
        summary=f"Permissions for {user.full_name}",
        data={
            "user_id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active,
            "capabilities": capabilities,
            "explanations": CAPABILITY_EXPLANATIONS,
            "module_visibility": module_visibility,
            "role_preset": ROLE_PRESETS.get(user.role, {}),
            "delegation": delegates_for_user,
            "legal_entity_id": user.legal_entity_id,
            "department": user.department,
        },
    )


REGISTRY.register(ToolSpec(
    name="get_user_permissions",
    description="Devuelve el desglose detallado de permisos de un usuario.",
    category="read",
    input_schema=GetUserPermissionsArgs,
    handler=_handle_get_user_permissions,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
))
