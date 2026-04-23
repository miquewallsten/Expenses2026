"""Shared helpers for destructive tools."""

from __future__ import annotations

from typing import Any

from ..core.context import AgentContext
from ..core.receipts import create_receipt
from ..core.registry import ToolResult


def diff_row(row: Any, patch: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for k, v in patch.items():
        if not hasattr(row, k):
            continue
        cur = getattr(row, k)
        if cur != v:
            out[k] = {"before": cur, "after": v}
    return out


def apply_diff(row: Any, diff: dict[str, dict[str, Any]]) -> None:
    for k, pair in diff.items():
        setattr(row, k, pair["after"])


def non_null(patch) -> dict[str, Any]:
    """Drop ``None`` fields from a Pydantic ``BaseModel``."""
    return {k: v for k, v in patch.model_dump().items() if v is not None}


def propose(
    ctx: AgentContext,
    *,
    tool_name: str,
    args: dict[str, Any],
    preview: dict[str, Any],
    summary: str,
) -> ToolResult:
    receipt = create_receipt(
        db=ctx.db,
        company_id=ctx.company_id,
        session_id=ctx.session_id,
        tool_name=tool_name,
        args=args,
        preview=preview,
    )
    return ToolResult(
        ok=True,
        summary=f"{summary} — requiere confirmación",
        data={"preview": preview},
        receipt_id=receipt.receipt_id,
    )
