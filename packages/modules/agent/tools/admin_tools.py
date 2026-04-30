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
