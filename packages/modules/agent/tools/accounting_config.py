"""Accounting Configuration Copilot tool registration.

This provides the 'Masterpiece' tools that allow the agent to guide the 
Tenant Admin through the complex process of setting up SAT-compliant 
accounting rules, accounts, and tax mappings.
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field

from packages.modules.accounting.service import chart_of_accounts_service as coa_service
from ..core.context import AgentContext
from ..core.registry import REGISTRY, ToolResult, ToolSpec

# ---------------------------------------------------------------------------
# Input Schemas
# ---------------------------------------------------------------------------

class _PresetArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    preset_name: str = Field("plan_basico", description="The name of the accounting preset to apply (e.g., 'plan_basico')")

class _MapAccountArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(..., description="The account code (e.g., '101.01')")
    name: str = Field(..., description="The account name")
    sat_group_code: Optional[str] = Field(None, description="The official SAT group code")
    account_class: str = Field("expense", description="Class: asset, liability, equity, revenue, expense")

# ---------------------------------------------------------------------------
# Tool Handlers
# ---------------------------------------------------------------------------

def _apply_preset(ctx: AgentContext, args: _PresetArgs) -> ToolResult:
    """Applies a pre-defined SAT-compliant chart of accounts preset to the company."""
    try:
        results = coa_service.apply_preset(ctx.db, ctx.company_id, args.preset_name)
        return ToolResult(
            ok=True,
            summary=f"Successfully applied preset '{args.preset_name}'.",
            data={
                "accounts_created": results["accounts"],
                "tax_rates_created": results["tax_rates"],
                "categories_bound": results["categories_bound"]
            }
        )
    except Exception as e:
        return ToolResult(ok=False, summary=f"Failed to apply preset: {str(e)}", error="preset_error")

def _upsert_account_mapping(ctx: AgentContext, args: _MapAccountArgs) -> ToolResult:
    """Creates or updates a specific accounting account mapping."""
    try:
        account = coa_service.upsert_account(ctx.db, ctx.company_id, {
            "code": args.code,
            "name": args.name,
            "sat_group_code": args.sat_group_code,
            "account_class": args.account_class,
            "is_postable": True,
            "split_by": "none",
            "sort_order": 0,
            "is_active": True
        })
        return ToolResult(
            ok=True,
            summary=f"Account {args.code} ({args.name}) has been mapped.",
            data={"account_id": account.id, "code": account.code}
        )
    except Exception as e:
        return ToolResult(ok=False, summary=f"Error mapping account: {str(e)}", error="mapping_error")

def _get_sat_reference(ctx: AgentContext, args: Any = None) -> ToolResult:
    """Retrieves the official SAT Código Agrupador reference catalog for suggestions."""
    try:
        catalog = coa_service.load_sat_reference()
        # Since the catalog can be huge, we return a summary or a way to search it
        return ToolResult(
            ok=True,
            summary="SAT reference catalog loaded. You can now suggest the correct codes to the user.",
            data={"catalog_size": len(catalog), "catalog": catalog}
        )
    except Exception as e:
        return ToolResult(ok=False, summary=f"Failed to load SAT reference: {str(e)}", error="catalog_error")

class _Empty(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

REGISTRY.register(
    ToolSpec(
        name="apply_accounting_preset",
        description="Apply a pre-configured set of SAT-compliant accounts and tax rates to the company. Use this for initial setup.",
        category="config",
        input_schema=_PresetArgs,
        handler=_apply_preset,
        personas={"accounting", "admin"},
    )
)

REGISTRY.register(
    ToolSpec(
        name="map_sat_account",
        description="Create or update a specific GL account mapping to an official SAT group code.",
        category="config",
        input_schema=_MapAccountArgs,
        handler=_upsert_account_mapping,
        personas={"accounting", "admin"},
    )
)

REGISTRY.register(
    ToolSpec(
        name="get_sat_reference",
        description="Access the official SAT Código Agrupador catalog to find the correct accounting codes for a business activity.",
        category="read",
        input_schema=_Empty,
        handler=_get_sat_reference,
        personas={"accounting", "admin"},
    )
)
