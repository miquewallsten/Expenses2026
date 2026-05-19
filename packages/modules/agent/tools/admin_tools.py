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
from packages.core.platform.models_user_project import UserProjectAssignment

from packages.modules.admin.service.company_setup_service import get_or_create_company_setup
from packages.modules.admin.service.approval_setup_service import get_or_create_approval_setup
from packages.modules.admin.service.accounting_setup_service import get_or_create_accounting_setup

from ..core.context import AgentContext
from ..core.notification_service import NOTIFICATION_SERVICE
from ..core.registry import REGISTRY, ToolResult, ToolSpec
from ._common import diff_row, non_null, propose


# ── create_user ──────────────────────────────────────────────────────────────

class CreateUserArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(..., min_length=3, max_length=255)
    full_name: str = Field(..., min_length=1, max_length=255)
    role: str = Field(default="employee", pattern=r"^(employee|manager|accounting|admin|executive|secretary)$")
    legal_entity_id: int | None = None
    department: str | None = Field(default=None, max_length=100)
    # Capabilities (optional, auto-suggested based on role)
    can_create_expenses: bool | None = None
    can_create_corporate_expenses: bool | None = None
    can_invoice_corporation: bool | None = None
    is_amex_reconciler: bool | None = None
    is_subcontractor: bool | None = None
    requires_time_tracking: bool | None = None
    has_executive_reporting: bool | None = None
    can_access_accounting: bool | None = None
    can_view_analytics: bool | None = None
    # Delegation
    delegates_for_user_id: int | None = None
    # Project assignments
    project_ids: list[int] | None = None
    # Invitation
    send_invite: bool = True


def _handle_create_user(ctx: AgentContext, args: CreateUserArgs) -> ToolResult:
    if ctx.user_role != "admin":
        return ToolResult(
            ok=False,
            summary="create_user requires admin role",
            error="forbidden",
        )

    # Check for existing user
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

    # Get role preset
    preset = ROLE_PRESETS.get(args.role, ROLE_PRESETS["employee"])

    # Apply preset values, allow overrides
    capability_fields = [
        "can_create_expenses",
        "can_create_corporate_expenses",
        "can_invoice_corporation",
        "is_amex_reconciler",
        "is_subcontractor",
        "requires_time_tracking",
        "has_executive_reporting",
        "can_access_accounting",
        "can_view_analytics",
    ]

    capabilities = {}
    for field in capability_fields:
        provided_value = getattr(args, field, None)
        if provided_value is not None:
            capabilities[field] = provided_value
        else:
            capabilities[field] = preset.get(field, False)

    # Create user
    new_user = User(
        email=args.email,
        full_name=args.full_name,
        role=args.role,
        company_id=ctx.company_id,
        department=args.department,
        legal_entity_id=args.legal_entity_id,
        delegates_for_user_id=args.delegates_for_user_id,
        **capabilities,
    )
    ctx.db.add(new_user)
    ctx.db.commit()
    ctx.db.refresh(new_user)

    # Assign projects if provided
    if args.project_ids:
        for pid in args.project_ids:
            up = UserProjectAssignment(user_id=new_user.id, project_id=pid)
            ctx.db.add(up)
        ctx.db.commit()

    # Send invite if requested
    if args.send_invite:
        # TODO: Send magic link invite
        pass

    return ToolResult(
        ok=True,
        summary=f"Created user {args.email} as {args.role}",
        data={
            "user_id": new_user.id,
            "email": new_user.email,
            "full_name": new_user.full_name,
            "role": new_user.role,
            "capabilities": capabilities,
            "delegates_for_user_id": new_user.delegates_for_user_id,
        },
    )


REGISTRY.register(ToolSpec(
    name="create_user",
    description="Crea un nuevo usuario con capacidades sugeridas según el rol.",
    category="config",
    input_schema=CreateUserArgs,
    handler=_handle_create_user,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
))


# ── invite_user (deprecated - kept for backward compatibility) ─────────────────

class InviteUserArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email:      str = Field(..., min_length=3, max_length=255)
    role:       str = Field(default="employee", pattern=r"^(employee|manager|accounting|admin|executive|secretary)$")
    department: str | None = Field(default=None, max_length=100)


def _handle_invite_user(ctx: AgentContext, args: InviteUserArgs) -> ToolResult:
    # Delegate to create_user for backward compatibility
    create_args = CreateUserArgs(
        email=args.email,
        full_name=args.email.split("@")[0],
        role=args.role,
        department=args.department,
    )
    return _handle_create_user(ctx, create_args)


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
    role:       str | None = Field(default=None, pattern=r"^(employee|manager|accounting|admin|executive|secretary)$")
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
    role_changed = False
    if args.role is not None and args.role != user.role:
        user.role = args.role
        changes["role"] = args.role
        role_changed = True
    if args.department is not None:
        user.department = args.department
        changes["department"] = args.department
    if args.full_name is not None:
        user.full_name = args.full_name
        changes["full_name"] = args.full_name

    if not changes:
        return ToolResult(ok=False, summary="No changes provided", error="empty_patch")

    ctx.db.commit()

    # Auto-sync capabilities with new role defaults
    synced = []
    if role_changed:
        from packages.core.platform.service_access import sync_role_capabilities
        synced = sync_role_capabilities(ctx.db, user)
        if synced:
            changes["auto_synced_capabilities"] = synced

    return ToolResult(
        ok=True,
        summary=f"Updated user {user.email}: {', '.join(changes.keys())}" + (f" (auto-synced: {', '.join(synced)})" if synced else ""),
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

    return propose(
        ctx,
        tool_name="deactivate_user",
        args={"user_id": args.user_id},
        preview={
            "action": "deactivate",
            "user_id": user.id,
            "email": user.email,
            "full_name": getattr(user, "full_name", None),
        },
        summary=f"Desactivar usuario {user.email}",
    )


def _apply_deactivate_user(ctx: AgentContext, args: dict) -> dict:
    user = (
        ctx.db.query(User)
        .filter(User.id == args["user_id"], User.company_id == ctx.company_id)
        .one_or_none()
    )
    if not user:
        raise ValueError(f"User {args['user_id']} not found")
    if user.id == ctx.user_id:
        raise ValueError("Cannot deactivate yourself")
    user.is_active = False
    ctx.db.commit()
    return {"user_id": user.id, "email": user.email, "is_active": False}


REGISTRY.register(ToolSpec(
    name="deactivate_user",
    description="Desactiva un usuario (no elimina datos históricos).",
    category="config",
    input_schema=DeactivateUserArgs,
    handler=_handle_deactivate_user,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
    destructive=True,
    requires_confirmation=True,
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

    return propose(
        ctx,
        tool_name="reactivate_user",
        args={"user_id": args.user_id},
        preview={
            "action": "reactivate",
            "user_id": user.id,
            "email": user.email,
            "full_name": getattr(user, "full_name", None),
        },
        summary=f"Reactivar usuario {user.email}",
    )


def _apply_reactivate_user(ctx: AgentContext, args: dict) -> dict:
    user = (
        ctx.db.query(User)
        .filter(User.id == args["user_id"], User.company_id == ctx.company_id)
        .one_or_none()
    )
    if not user:
        raise ValueError(f"User {args['user_id']} not found")
    if user.is_active:
        raise ValueError(f"User {user.email} is already active")
    user.is_active = True
    ctx.db.commit()
    return {"user_id": user.id, "email": user.email, "is_active": True}


REGISTRY.register(ToolSpec(
    name="reactivate_user",
    description="Reactiva un usuario previamente desactivado.",
    category="config",
    input_schema=ReactivateUserArgs,
    handler=_handle_reactivate_user,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
    destructive=True,
    requires_confirmation=True,
))


# ── list_users ──────────────────────────────────────────────────────────────

VALID_ROLES = ("employee", "manager", "accounting", "admin", "executive", "secretary")

VALID_CAPABILITIES = (
    "can_create_expenses",
    "can_create_corporate_expenses",
    "can_invoice_corporation",
    "is_amex_reconciler",
    "is_subcontractor",
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
                "is_subcontractor": u.is_subcontractor,
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




# ── get_user_permissions ──────────────────────────────────────────────────────

CAPABILITY_EXPLANATIONS = {
    "can_create_expenses": "Can create and submit expense reports",
    "can_create_corporate_expenses": "Can create corporate card expenses",
    "can_invoice_corporation": "Can invoice on behalf of the corporation",
    "is_amex_reconciler": "Can reconcile AMEX statements",
    "is_subcontractor": "Is a subcontractor user",
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
        "is_subcontractor": False,
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
        "is_subcontractor": False,
        "requires_time_tracking": False,
        "has_executive_reporting": False,
        "can_access_accounting": False,
        "can_view_analytics": False,
    },
    "accounting": {
        "can_create_expenses": False,
        "can_create_corporate_expenses": False,
        "can_invoice_corporation": False,
        "is_amex_reconciler": False,
        "is_subcontractor": False,
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
        "is_subcontractor": False,
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
        "is_subcontractor": False,
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
        "is_subcontractor": False,
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
        role == "accounting" or
        capabilities.get("can_access_accounting", False)
    ) and company_modules.get("accounting_module_enabled", True)

    # Finance Analytics: requires accounting/executive role OR can_view_analytics
    visibility["finance_analytics"] = (
        role in ("accounting", "executive") or
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
        "is_subcontractor": user.is_subcontractor,
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
    name="list_users",
    description="Lista usuarios con filtros, agrupación y métricas opcionales.",
    category="read",
    input_schema=ListUsersArgs,
    handler=_handle_list_users,
    personas=frozenset({"admin"}),
))


# ── update_user_permissions ────────────────────────────────────────────────────

class UpdateUserPermissionsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: int
    # Capabilities
    can_create_expenses: bool | None = None
    can_create_corporate_expenses: bool | None = None
    can_invoice_corporation: bool | None = None
    is_amex_reconciler: bool | None = None
    is_subcontractor: bool | None = None
    requires_time_tracking: bool | None = None
    has_executive_reporting: bool | None = None
    can_access_accounting: bool | None = None
    can_view_analytics: bool | None = None
    # Delegation
    delegates_for_user_id: int | None = None
    # Projects
    project_ids: list[int] | None = None
    # Legal entity
    legal_entity_id: int | None = None


def _handle_update_user_permissions(ctx: AgentContext, args: UpdateUserPermissionsArgs) -> ToolResult:
    if ctx.user_role != "admin":
        return ToolResult(
            ok=False,
            summary="update_user_permissions requires admin role",
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

    changes: dict[str, Any] = {}

    # Update capabilities
    capability_fields = [
        "can_create_expenses",
        "can_create_corporate_expenses",
        "can_invoice_corporation",
        "is_amex_reconciler",
        "is_subcontractor",
        "requires_time_tracking",
        "has_executive_reporting",
        "can_access_accounting",
        "can_view_analytics",
    ]

    for field in capability_fields:
        value = getattr(args, field, None)
        if value is not None:
            setattr(user, field, value)
            changes[field] = value

    # Update delegation
    if args.delegates_for_user_id is not None:
        # 0 means clear delegation
        if args.delegates_for_user_id == 0:
            user.delegates_for_user_id = None
            changes["delegates_for_user_id"] = 0
        else:
            # Verify the boss exists and is in the same company
            boss = (
                ctx.db.query(User)
                .filter(User.id == args.delegates_for_user_id, User.company_id == ctx.company_id)
                .first()
            )
            if not boss:
                return ToolResult(
                    ok=False,
                    summary=f"Boss user {args.delegates_for_user_id} not found",
                    error="invalid_delegation",
                )
            user.delegates_for_user_id = args.delegates_for_user_id
            changes["delegates_for_user_id"] = args.delegates_for_user_id

    # Update legal entity
    if args.legal_entity_id is not None:
        user.legal_entity_id = args.legal_entity_id
        changes["legal_entity_id"] = args.legal_entity_id

    # Update projects
    if args.project_ids is not None:
        # Clear existing
        ctx.db.query(UserProjectAssignment).filter(UserProjectAssignment.user_id == user.id).delete()
        # Add new
        for pid in args.project_ids:
            up = UserProjectAssignment(user_id=user.id, project_id=pid)
            ctx.db.add(up)
        changes["project_ids"] = args.project_ids

    if not changes:
        return ToolResult(
            ok=False,
            summary="No changes provided",
            error="empty_patch",
        )

    ctx.db.commit()

    return ToolResult(
        ok=True,
        summary=f"Updated permissions for {user.email}",
        data={
            "user_id": user.id,
            "changes": changes,
        },
    )


REGISTRY.register(ToolSpec(
    name="update_user_permissions",
    description="Actualiza las capacidades y asignaciones de un usuario.",
    category="config",
    input_schema=UpdateUserPermissionsArgs,
    handler=_handle_update_user_permissions,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
))


# ── audit_permissions ─────────────────────────────────────────────────────────

class AuditPermissionsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    check_type: str = Field(..., pattern=r"^(role_capability_mismatch|missing_assignments|orphaned_data|module_gaps|all)$")


def _handle_audit_permissions(ctx: AgentContext, args: AuditPermissionsArgs) -> ToolResult:
    if ctx.user_role != "admin":
        return ToolResult(
            ok=False,
            summary="audit_permissions requires admin role",
            error="forbidden",
        )

    findings = []

    # Get all users
    users = (
        ctx.db.query(User)
        .filter(User.company_id == ctx.company_id)
        .all()
    )

    # Get company modules
    setup = (
        ctx.db.query(CompanySetup)
        .filter(CompanySetup.company_id == ctx.company_id)
        .first()
    )
    company_modules = {
        "accounting_module_enabled": setup.accounting_module_enabled if setup else True,
        "time_allocation_module_enabled": setup.time_allocation_module_enabled if setup else False,
        "amex_reconciliation_module_enabled": setup.amex_reconciliation_module_enabled if setup else False,
    }

    check_all = args.check_type == "all"

    # Check 1: Role capability mismatch
    if args.check_type in ("role_capability_mismatch", "all"):
        for u in users:
            # Accounting users without accounting access
            if u.role == "accounting" and not u.can_access_accounting:
                findings.append({
                    "type": "accounting_without_accounting_access",
                    "user_id": u.id,
                    "email": u.email,
                    "role": u.role,
                    "suggestion": f"Set can_access_accounting=True for {u.email}",
                })

            # Executives without executive reporting
            if u.role == "executive" and not u.has_executive_reporting:
                findings.append({
                    "type": "executive_without_reporting",
                    "user_id": u.id,
                    "email": u.email,
                    "role": u.role,
                    "suggestion": f"Set has_executive_reporting=True for {u.email}",
                })

    # Check 2: Missing assignments
    if args.check_type in ("missing_assignments", "all"):
        for u in users:
            # Secretaries without boss
            if u.role == "secretary" and not u.delegates_for_user_id:
                findings.append({
                    "type": "secretary_without_boss",
                    "user_id": u.id,
                    "email": u.email,
                    "role": u.role,
                    "suggestion": f"Assign a boss for secretary {u.email}",
                })

            # Users with time tracking but no projects
            if u.requires_time_tracking and company_modules.get("time_allocation_module_enabled"):
                user_projects = (
                    ctx.db.query(UserProjectAssignment)
                    .filter(UserProjectAssignment.user_id == u.id)
                    .count()
                )
                if user_projects == 0:
                    findings.append({
                        "type": "time_tracking_without_projects",
                        "user_id": u.id,
                        "email": u.email,
                        "suggestion": f"Assign projects to {u.email} for time tracking",
                    })

    # Check 3: Orphaned data
    if args.check_type in ("orphaned_data", "all"):
        inactive = [u for u in users if not u.is_active]
        for u in inactive:
            findings.append({
                "type": "inactive_user",
                "user_id": u.id,
                "email": u.email,
                "suggestion": f"Consider reactivating or archiving {u.email}",
            })

    # Check 4: Module gaps
    if args.check_type in ("module_gaps", "all"):
        for u in users:
            if u.is_amex_reconciler and not company_modules.get("amex_reconciliation_module_enabled"):
                findings.append({
                    "type": "capability_for_disabled_module",
                    "user_id": u.id,
                    "email": u.email,
                    "capability": "is_amex_reconciler",
                    "module": "amex_reconciliation",
                    "suggestion": f"Disable is_amex_reconciler for {u.email} or enable the module",
                })
            if u.is_subcontractor and not company_modules.get("subcontractor_module_enabled"):
                findings.append({
                    "type": "capability_for_disabled_module",
                    "user_id": u.id,
                    "email": u.email,
                    "capability": "is_subcontractor",
                    "module": "subcontractor",
                    "suggestion": f"Disable is_subcontractor for {u.email} or enable the module",
                })

            if u.requires_time_tracking and not company_modules.get("time_allocation_module_enabled"):
                findings.append({
                    "type": "capability_for_disabled_module",
                    "user_id": u.id,
                    "email": u.email,
                    "capability": "requires_time_tracking",
                    "module": "time_allocation",
                    "suggestion": f"Disable requires_time_tracking for {u.email} or enable the module",
                })

    return ToolResult(
        ok=True,
        summary=f"Found {len(findings)} permission issues",
        data={
            "check_type": args.check_type,
            "findings": findings,
            "total_checked": len(users),
        },
    )


REGISTRY.register(ToolSpec(
    name="audit_permissions",
    description="Audita permisos y encuentra inconsistencias.",
    category="read",
    input_schema=AuditPermissionsArgs,
    handler=_handle_audit_permissions,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
))


# ── RBAC Management Tools ────────────────────────────────────────────────────
# Tools for managing roles, permissions, and role-permission assignments.
# These let the admin copilot manage access control end-to-end.

class ListRolesArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    company_id: int | None = None


def _handle_list_roles(ctx: AgentContext, args: ListRolesArgs) -> ToolResult:
    """List all roles and their permission keys for the company."""
    from packages.core.platform.models_role import Role
    from packages.core.platform.models_permission import Permission
    from packages.core.platform.models_role_permission import RolePermission

    company_id = args.company_id or ctx.company_id
    if company_id != ctx.company_id and ctx.user_role != "admin":
        return ToolResult(ok=False, summary="Cannot query other companies", error="forbidden")

    roles = ctx.db.query(Role).filter(Role.company_id == company_id).all()

    # Also include built-in role defaults from service_permissions
    from packages.core.platform.service_permissions import _BUILTIN_ROLE_DEFAULTS, PERMISSION_CATALOG

    result = []
    for role in roles:
        perm_keys = [
            p.key for p in
            ctx.db.query(Permission.key)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .filter(RolePermission.role_id == role.id)
            .all()
        ]
        result.append({
            "id": role.id,
            "key": role.key,
            "name": role.name,
            "description": role.description,
            "permission_keys": perm_keys,
        })

    return ToolResult(
        ok=True,
        summary=f"{len(result)} roles configurados",
        data={
            "roles": result,
            "builtin_defaults": {k: sorted(v) for k, v in _BUILTIN_ROLE_DEFAULTS.items()},
            "available_permissions": sorted(PERMISSION_CATALOG.keys()),
        },
    )


REGISTRY.register(ToolSpec(
    name="list_roles",
    description="Lista los roles y permisos de la compañía (incluye defaults del sistema).",
    category="read",
    input_schema=ListRolesArgs,
    handler=_handle_list_roles,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
))


class CreateRoleArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    permission_keys: list[str] = Field(default_factory=list)


def _handle_create_role(ctx: AgentContext, args: CreateRoleArgs) -> ToolResult:
    """Create a new custom role with optional permissions."""
    from packages.core.platform.models_role import Role
    from packages.core.platform.models_permission import Permission
    from packages.core.platform.models_role_permission import RolePermission
    from packages.core.platform.service_permissions import invalidate_cache, PERMISSION_CATALOG

    # Validate permission keys
    invalid = [k for k in args.permission_keys if k not in PERMISSION_CATALOG]
    if invalid:
        return ToolResult(
            ok=False,
            summary=f"Claves de permiso inválidas: {', '.join(invalid)}",
            error="invalid_permission_keys",
        )

    existing = ctx.db.query(Role).filter(
        Role.company_id == ctx.company_id, Role.key == args.key
    ).first()
    if existing:
        return ToolResult(
            ok=False,
            summary=f"Rol '{args.key}' ya existe",
            error="duplicate_role",
        )

    return propose(
        ctx,
        tool_name="create_role",
        args={"key": args.key, "name": args.name, "description": args.description, "permission_keys": args.permission_keys},
        preview={"action": "create_role", "key": args.key, "name": args.name, "permission_count": len(args.permission_keys)},
        summary=f"Crear rol '{args.name}' ({args.key}) con {len(args.permission_keys)} permisos",
    )


def _apply_create_role(ctx: AgentContext, args: dict) -> dict:
    from packages.core.platform.models_role import Role
    from packages.core.platform.models_permission import Permission
    from packages.core.platform.models_role_permission import RolePermission
    from packages.core.platform.service_permissions import invalidate_cache

    role = Role(
        company_id=ctx.company_id,
        key=args["key"],
        name=args["name"],
        description=args.get("description"),
    )
    ctx.db.add(role)
    ctx.db.flush()

    # Ensure Permission rows exist and assign them
    for perm_key in args.get("permission_keys", []):
        perm = ctx.db.query(Permission).filter(Permission.key == perm_key).first()
        if not perm:
            perm = Permission(key=perm_key, name=perm_key)
            ctx.db.add(perm)
            ctx.db.flush()
        rp = RolePermission(role_id=role.id, permission_id=perm.id)
        ctx.db.add(rp)

    ctx.db.commit()
    invalidate_cache(ctx.company_id, args["key"])
    return {"role_id": role.id, "key": args["key"], "permission_count": len(args.get("permission_keys", []))}


REGISTRY.register(ToolSpec(
    name="create_role",
    description="Crea un rol personalizado con permisos específicos.",
    category="config",
    input_schema=CreateRoleArgs,
    handler=_handle_create_role,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
    destructive=True,
    requires_confirmation=True,
))


class AssignPermissionToRoleArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role_key: str = Field(..., min_length=1, max_length=100)
    permission_keys: list[str] = Field(default_factory=list)


def _handle_assign_permission_to_role(ctx: AgentContext, args: AssignPermissionToRoleArgs) -> ToolResult:
    """Add permissions to an existing role (built-in or custom)."""
    from packages.core.platform.models_role import Role
    from packages.core.platform.models_permission import Permission
    from packages.core.platform.models_role_permission import RolePermission
    from packages.core.platform.service_permissions import PERMISSION_CATALOG

    invalid = [k for k in args.permission_keys if k not in PERMISSION_CATALOG]
    if invalid:
        return ToolResult(
            ok=False,
            summary=f"Claves de permiso inválidas: {', '.join(invalid)}",
            error="invalid_permission_keys",
        )

    role = ctx.db.query(Role).filter(
        Role.company_id == ctx.company_id, Role.key == args.role_key
    ).first()
    if not role:
        # Auto-create the role row for built-in roles that don't have a DB entry yet
        from packages.core.platform.service_permissions import _BUILTIN_ROLE_DEFAULTS
        if args.role_key in _BUILTIN_ROLE_DEFAULTS:
            role = Role(company_id=ctx.company_id, key=args.role_key, name=args.role_key)
            ctx.db.add(role)
            ctx.db.flush()
        else:
            return ToolResult(
                ok=False,
                summary=f"Rol '{args.role_key}' no existe",
                error="role_not_found",
            )

    # Check which permissions are already assigned
    existing = {
        p.key for p in
        ctx.db.query(Permission.key)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .filter(RolePermission.role_id == role.id)
        .all()
    }
    new_keys = [k for k in args.permission_keys if k not in existing]
    if not new_keys:
        return ToolResult(ok=True, summary=f"Todos los permisos ya están asignados al rol '{args.role_key}'")

    return propose(
        ctx,
        tool_name="assign_permission_to_role",
        args={"role_key": args.role_key, "permission_keys": args.permission_keys},
        preview={"action": "assign_permissions", "role_key": args.role_key, "new_keys": new_keys, "already_assigned": sorted(existing)},
        summary=f"Agregar {len(new_keys)} permisos al rol '{args.role_key}'",
    )


def _apply_assign_permission_to_role(ctx: AgentContext, args: dict) -> dict:
    from packages.core.platform.models_role import Role
    from packages.core.platform.models_permission import Permission
    from packages.core.platform.models_role_permission import RolePermission
    from packages.core.platform.service_permissions import invalidate_cache

    role = ctx.db.query(Role).filter(
        Role.company_id == ctx.company_id, Role.key == args["role_key"]
    ).first()
    if not role:
        return {"error": "role not found"}

    existing = {
        p.Permission_key for p in
        ctx.db.query(RolePermission, Permission.key)
        .join(Permission, Permission.id == RolePermission.permission_id)
        .filter(RolePermission.role_id == role.id)
        .all()
    } if False else set()  # Simpler approach: just add, rely on unique constraint

    added = []
    for perm_key in args.get("permission_keys", []):
        perm = ctx.db.query(Permission).filter(Permission.key == perm_key).first()
        if not perm:
            perm = Permission(key=perm_key, name=perm_key)
            ctx.db.add(perm)
            ctx.db.flush()
        # Check if already assigned
        exists = ctx.db.query(RolePermission).filter(
            RolePermission.role_id == role.id,
            RolePermission.permission_id == perm.id,
        ).first()
        if not exists:
            rp = RolePermission(role_id=role.id, permission_id=perm.id)
            ctx.db.add(rp)
            added.append(perm_key)

    ctx.db.commit()
    invalidate_cache(ctx.company_id, args["role_key"])
    return {"role_key": args["role_key"], "added": added}


REGISTRY.register(ToolSpec(
    name="assign_permission_to_role",
    description="Agrega permisos a un rol existente (incluye roles built-in como admin, accounting).",
    category="config",
    input_schema=AssignPermissionToRoleArgs,
    handler=_handle_assign_permission_to_role,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
    destructive=True,
    requires_confirmation=True,
))


class AssignRoleToUserArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: int
    role_key: str = Field(..., min_length=1, max_length=100)


def _handle_assign_role_to_user(ctx: AgentContext, args: AssignRoleToUserArgs) -> ToolResult:
    """Assign an additional role to a user (multi-role support)."""
    from packages.core.platform.models_role import Role
    from packages.core.platform.models_user_role import UserRole
    from packages.core.platform.models_user import User

    user = ctx.db.query(User).filter(
        User.id == args.user_id, User.company_id == ctx.company_id
    ).first()
    if not user:
        return ToolResult(ok=False, summary=f"Usuario {args.user_id} no encontrado", error="not_found")

    role = ctx.db.query(Role).filter(
        Role.company_id == ctx.company_id, Role.key == args.role_key
    ).first()
    if not role:
        return ToolResult(ok=False, summary=f"Rol '{args.role_key}' no encontrado", error="role_not_found")

    # Check if already assigned
    existing = ctx.db.query(UserRole).filter(
        UserRole.user_id == user.id, UserRole.role_id == role.id
    ).first()
    if existing:
        return ToolResult(ok=True, summary=f"Usuario ya tiene el rol '{args.role_key}'")

    return propose(
        ctx,
        tool_name="assign_role_to_user",
        args={"user_id": args.user_id, "role_key": args.role_key},
        preview={"action": "assign_role", "user_id": user.id, "email": user.email, "role_key": args.role_key},
        summary=f"Asignar rol '{args.role_key}' a {user.email}",
    )


def _apply_assign_role_to_user(ctx: AgentContext, args: dict) -> dict:
    from packages.core.platform.models_role import Role
    from packages.core.platform.models_user_role import UserRole
    from packages.core.platform.service_permissions import invalidate_cache

    role = ctx.db.query(Role).filter(
        Role.company_id == ctx.company_id, Role.key == args["role_key"]
    ).first()
    if not role:
        return {"error": "role not found"}

    ur = UserRole(user_id=args["user_id"], role_id=role.id)
    ctx.db.add(ur)
    ctx.db.commit()
    invalidate_cache(ctx.company_id, args["role_key"])
    return {"user_id": args["user_id"], "role_key": args["role_key"], "assigned": True}


REGISTRY.register(ToolSpec(
    name="assign_role_to_user",
    description="Asigna un rol adicional a un usuario (soporte multi-rol).",
    category="config",
    input_schema=AssignRoleToUserArgs,
    handler=_handle_assign_role_to_user,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
    destructive=True,
    requires_confirmation=True,
))


class RemovePermissionFromRoleArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role_key: str = Field(..., min_length=1, max_length=100)
    permission_keys: list[str] = Field(default_factory=list)


def _handle_remove_permission_from_role(ctx: AgentContext, args: RemovePermissionFromRoleArgs) -> ToolResult:
    """Remove permissions from a role."""
    from packages.core.platform.models_role import Role
    from packages.core.platform.models_permission import Permission
    from packages.core.platform.models_role_permission import RolePermission

    role = ctx.db.query(Role).filter(
        Role.company_id == ctx.company_id, Role.key == args.role_key
    ).first()
    if not role:
        return ToolResult(ok=False, summary=f"Rol '{args.role_key}' no encontrado", error="role_not_found")

    # Find existing assignments
    to_remove = []
    for perm_key in args.permission_keys:
        perm = ctx.db.query(Permission).filter(Permission.key == perm_key).first()
        if perm:
            rp = ctx.db.query(RolePermission).filter(
                RolePermission.role_id == role.id,
                RolePermission.permission_id == perm.id,
            ).first()
            if rp:
                to_remove.append(perm_key)

    if not to_remove:
        return ToolResult(ok=True, summary=f"Ninguno de esos permisos están asignados al rol '{args.role_key}'")

    return propose(
        ctx,
        tool_name="remove_permission_from_role",
        args={"role_key": args.role_key, "permission_keys": to_remove},
        preview={"action": "remove_permissions", "role_key": args.role_key, "removing": to_remove},
        summary=f"Remover {len(to_remove)} permisos del rol '{args.role_key}'",
    )


def _apply_remove_permission_from_role(ctx: AgentContext, args: dict) -> dict:
    from packages.core.platform.models_role import Role
    from packages.core.platform.models_permission import Permission
    from packages.core.platform.models_role_permission import RolePermission
    from packages.core.platform.service_permissions import invalidate_cache

    role = ctx.db.query(Role).filter(
        Role.company_id == ctx.company_id, Role.key == args["role_key"]
    ).first()
    if not role:
        return {"error": "role not found"}

    removed = []
    for perm_key in args.get("permission_keys", []):
        perm = ctx.db.query(Permission).filter(Permission.key == perm_key).first()
        if perm:
            ctx.db.query(RolePermission).filter(
                RolePermission.role_id == role.id,
                RolePermission.permission_id == perm.id,
            ).delete()
            removed.append(perm_key)

    ctx.db.commit()
    invalidate_cache(ctx.company_id, args["role_key"])
    return {"role_key": args["role_key"], "removed": removed}




REGISTRY.register(ToolSpec(
    name="remove_permission_from_role",
    description="Remueve permisos de un rol existente.",
    category="config",
    input_schema=RemovePermissionFromRoleArgs,
    handler=_handle_remove_permission_from_role,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
    destructive=True,
    requires_confirmation=True,
))
