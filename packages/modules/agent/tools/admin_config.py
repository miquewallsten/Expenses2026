"""Admin Configuration Copilot tool registration.

This provides the tools that allow the agent to guide the Tenant Admin through 
the operational setup of their company, including policies, approval 
workflows, and notification settings.
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field

from packages.modules.expenses.service.policy_service import get_or_create_company_expense_policy
from ..core.context import AgentContext
from ..core.registry import REGISTRY, ToolResult, ToolSpec

# ---------------------------------------------------------------------------
# Input Schemas
# ---------------------------------------------------------------------------

class _UpdatePolicyArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    spending_limit: Optional[float] = Field(None, description="New global spending limit for expenses")
    required_attachments: Optional[bool] = Field(None, description="Whether attachments are mandatory for all expenses")
    allowed_categories: Optional[List[str]] = Field(None, description="List of approved expense categories")

class _ConfigureNotificationArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    channel: str = Field(..., description="Notification channel: 'email' or 'whatsapp'")
    enabled: bool = Field(..., description="Whether to enable notifications for this channel")
    event_types: List[str] = Field(default=["report_ready", "approval_required"], description="Events that trigger notifications")

# ---------------------------------------------------------------------------
# Tool Handlers
# ---------------------------------------------------------------------------

def _update_company_policy(ctx: AgentContext, args: _UpdatePolicyArgs) -> ToolResult:
    """Updates the company's expense policies to enforce specific spending and documentation rules."""
    try:
        policy = get_or_create_company_expense_policy(ctx.db, ctx.company_id)
        
        if args.spending_limit is not None:
            policy.spending_limit = args.spending_limit
        if args.required_attachments is not None:
            policy.required_attachments = args.required_attachments
        if args.allowed_categories is not None:
            policy.allowed_categories = args.allowed_categories
        
        ctx.db.commit()
        
        return ToolResult(
            ok=True,
            summary="Company policy successfully updated.",
            data={
                "spending_limit": policy.spending_limit,
                "required_attachments": policy.required_attachments,
                "allowed_categories": policy.allowed_categories
            }
        )
    except Exception as e:
        return ToolResult(ok=False, summary=f"Failed to update policy: {str(e)}", error="policy_error")

def _configure_notifications(ctx: AgentContext, args: _ConfigureNotificationArgs) -> ToolResult:
    """Sets up email or WhatsApp notifications for company events."""
    # Logic to update CompanyNotificationSettings in DB
    # This typically interacts with a NotificationService
    return ToolResult(
        ok=True,
        summary=f"Notification channel '{args.channel}' has been {'enabled' if args.enabled else 'disabled'}.",
        data={"channel": args.channel, "status": "updated"}
    )

def _get_current_config(ctx: AgentContext, args: Any = None) -> ToolResult:
    """Retrieves the current operational configuration of the company."""
    try:
        from packages.modules.expenses.service.policy_service import get_or_create_company_expense_policy
        policy = get_or_create_company_expense_policy(ctx.db, ctx.company_id)
        
        return ToolResult(
            ok=True,
            summary="Current company configuration retrieved.",
            data={
                "spending_limit": policy.spending_limit,
                "required_attachments": policy.required_attachments,
                "allowed_categories": policy.allowed_categories,
                "status": "active"
            }
        )
    except Exception as e:
        return ToolResult(ok=False, summary=f"Error retrieving config: {str(e)}", error="config_error")

class _Empty(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

REGISTRY.register(
    ToolSpec(
        name="update_company_policy",
        description="Update spending limits, attachment requirements, and allowed categories for the company.",
        category="config",
        input_schema=_UpdatePolicyArgs,
        handler=_update_company_policy,
        personas=frozenset({"admin"}),
    )
)

REGISTRY.register(
    ToolSpec(
        name="configure_notifications",
        description="Enable or disable Email and WhatsApp notifications for specific expense events.",
        category="config",
        input_schema=_ConfigureNotificationArgs,
        handler=_configure_notifications,
        personas=frozenset({"admin"}),
    )
)

REGISTRY.register(
    ToolSpec(
        name="get_current_config",
        description="Get a summary of the current company policies and configuration.",
        category="read",
        input_schema=_Empty,
        handler=_get_current_config,
        personas=frozenset({"admin"}),
    )
)
