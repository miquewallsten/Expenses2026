"""Expense Bundling Agent tool registration.

Provides the `bundle_expenses` tool which automatically groups all 
fully verified expenses for a user into a professional Expense Report.
"""

from __future__ import annotations
from typing import Any, Dict
from pydantic import BaseModel, ConfigDict, Field

from packages.modules.expenses.service.bundling_service import BundlingService
from ..core.context import AgentContext
from ..core.registry import REGISTRY, ToolResult, ToolSpec

class _BundleArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    report_title: str = Field("Monthly Expense Report", description="Title for the generated report")

def _bundle_expenses(ctx: AgentContext, args: _BundleArgs) -> ToolResult:
    db = ctx.db
    
    # We need the user_id of the person the agent is helping.
    # In our system, the 'ctx.user_id' is the current active user.
    user_id = ctx.user_id
    if not user_id:
        return ToolResult(ok=False, summary="User context missing", error="no_user")

    try:
        # Trigger the bundling service
        report = BundlingService.bundle_verified_expenses(
            db=db, 
            company_id=ctx.company_id, 
            user_id=user_id, 
            report_title=args.report_title
        )
        
        # Get the manifest for the final summary
        manifest = BundlingService.get_bundle_manifest(db, report.id)
        
        return ToolResult(
            ok=True,
            summary=f"Successfully created report '{report.title}' with {manifest['total_expenses']} expenses.",
            data={
                "report_id": report.id,
                "status": report.status,
                "total_expenses": manifest['total_expenses'],
                "manifest": manifest['manifest']
            }
        )
    except ValueError as e:
        return ToolResult(ok=False, summary=str(e), error="validation_error")
    except Exception as e:
        return ToolResult(ok=False, summary=f"Unexpected error during bundling: {str(e)}", error="internal_error")

REGISTRY.register(
    ToolSpec(
        name="bundle_expenses",
        description="Automatically bundle all fully verified expenses into a professional Expense Report with XMLs and PDFs.",
        category="write",
        input_schema=_BundleArgs,
        handler=_bundle_expenses,
        personas={"accounting", "admin"},
    )
)
