"""Infra config tools: storage, archive, export bundle.

One row per company. Read returns non-secret fields. Update creates a
receipt; the applier writes after /agent/confirm.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict

from packages.core.platform.models_archive_config import ArchiveConfig
from packages.core.platform.models_export_bundle_config import ExportBundleConfig
from packages.core.platform.models_storage_config import StorageConfig

from ..core.appliers import register_applier
from ..core.context import AgentContext
from ..core.registry import REGISTRY, ToolResult, ToolSpec
from ._common import apply_diff, diff_row, non_null, propose


class Empty(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ── helpers ────────────────────────────────────────────────────────────────

def _get_or_create(ctx: AgentContext, model, defaults: dict[str, Any] | None = None):
    row = ctx.db.query(model).filter(model.company_id == ctx.company_id).one_or_none()
    if row is None:
        row = model(company_id=ctx.company_id, **(defaults or {}))
        ctx.db.add(row)
        ctx.db.flush()
    return row


# ── storage_config ─────────────────────────────────────────────────────────

def _read_storage_config(ctx: AgentContext, _: Empty) -> ToolResult:
    row = ctx.db.query(StorageConfig).filter(StorageConfig.company_id == ctx.company_id).one_or_none()
    if row is None:
        row = ctx.db.query(StorageConfig).filter(StorageConfig.company_id == 0).one_or_none()
    data = {} if row is None else {
        "backend": row.backend, "local_path": row.local_path,
        "endpoint_url": row.endpoint_url, "bucket": row.bucket,
        "prefix": row.prefix, "region": row.region,
        "azure_account": row.azure_account, "azure_container": row.azure_container,
    }
    return ToolResult(ok=True, summary="storage config", data=data)


class StoragePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    backend:         str | None = None
    local_path:      str | None = None
    endpoint_url:    str | None = None
    bucket:          str | None = None
    prefix:          str | None = None
    region:          str | None = None
    azure_account:   str | None = None
    azure_container: str | None = None


def _handle_update_storage_config(ctx: AgentContext, args: StoragePatch) -> ToolResult:
    patch = non_null(args)
    if not patch:
        return ToolResult(ok=False, summary="sin cambios", error="empty_patch")
    row = _get_or_create(ctx, StorageConfig, {"backend": "local"})
    diff = diff_row(row, patch)
    ctx.db.rollback()  # discard optimistic flush
    if not diff:
        return ToolResult(ok=True, summary="sin cambios")
    return propose(ctx, tool_name="update_storage_config", args=patch,
                   preview={"action": "update_storage_config", "diff": diff},
                   summary="actualizar configuración de almacenamiento")


def _apply_update_storage_config(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    row = _get_or_create(ctx, StorageConfig, {"backend": "local"})
    apply_diff(row, diff_row(row, args))
    ctx.db.commit()
    return {"updated": True, "company_id": ctx.company_id}


REGISTRY.register(ToolSpec(name="read_storage_config", description="Lee la configuración de almacenamiento.",
                           category="read", input_schema=Empty, handler=_read_storage_config,
                           personas=frozenset({"admin"})))
REGISTRY.register(ToolSpec(name="update_storage_config", description="Actualiza la configuración de almacenamiento.",
                           category="config", input_schema=StoragePatch, handler=_handle_update_storage_config,
                           personas=frozenset({"admin"}), destructive=True, requires_confirmation=True))
register_applier("update_storage_config", _apply_update_storage_config)


# ── archive_config ─────────────────────────────────────────────────────────

def _read_archive_config(ctx: AgentContext, _: Empty) -> ToolResult:
    row = ctx.db.query(ArchiveConfig).filter(ArchiveConfig.company_id == ctx.company_id).one_or_none()
    data = {} if row is None else {"file_pattern": row.file_pattern, "folder_pattern": row.folder_pattern}
    return ToolResult(ok=True, summary="archive config", data=data)


class ArchivePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    file_pattern:   str | None = None
    folder_pattern: str | None = None


def _handle_update_archive_config(ctx: AgentContext, args: ArchivePatch) -> ToolResult:
    patch = non_null(args)
    if not patch:
        return ToolResult(ok=False, summary="sin cambios", error="empty_patch")
    row = _get_or_create(ctx, ArchiveConfig)
    diff = diff_row(row, patch)
    ctx.db.rollback()
    if not diff:
        return ToolResult(ok=True, summary="sin cambios")
    return propose(ctx, tool_name="update_archive_config", args=patch,
                   preview={"action": "update_archive_config", "diff": diff},
                   summary="actualizar patrón de archivado")


def _apply_update_archive_config(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    row = _get_or_create(ctx, ArchiveConfig)
    apply_diff(row, diff_row(row, args))
    ctx.db.commit()
    return {"updated": True}


REGISTRY.register(ToolSpec(name="read_archive_config", description="Lee la configuración de archivado.",
                           category="read", input_schema=Empty, handler=_read_archive_config,
                           personas=frozenset({"admin"})))
REGISTRY.register(ToolSpec(name="update_archive_config", description="Actualiza la configuración de archivado.",
                           category="config", input_schema=ArchivePatch, handler=_handle_update_archive_config,
                           personas=frozenset({"admin"}), destructive=True, requires_confirmation=True))
register_applier("update_archive_config", _apply_update_archive_config)


# ── export_bundle_config ───────────────────────────────────────────────────

def _read_export_bundle_config(ctx: AgentContext, _: Empty) -> ToolResult:
    row = ctx.db.query(ExportBundleConfig).filter(ExportBundleConfig.company_id == ctx.company_id).one_or_none()
    data = {} if row is None else {
        "bundle_name_pattern": row.bundle_name_pattern,
        "export_format": row.export_format,
    }
    return ToolResult(ok=True, summary="export bundle config", data=data)


class BundlePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bundle_name_pattern: str | None = None
    export_format:       str | None = None  # "json" | "csv"


def _handle_update_export_bundle_config(ctx: AgentContext, args: BundlePatch) -> ToolResult:
    patch = non_null(args)
    if not patch:
        return ToolResult(ok=False, summary="sin cambios", error="empty_patch")
    if "export_format" in patch and patch["export_format"] not in ("json", "csv"):
        return ToolResult(ok=False, summary="formato inválido", error="invalid_format")
    row = _get_or_create(ctx, ExportBundleConfig)
    diff = diff_row(row, patch)
    ctx.db.rollback()
    if not diff:
        return ToolResult(ok=True, summary="sin cambios")
    return propose(ctx, tool_name="update_export_bundle_config", args=patch,
                   preview={"action": "update_export_bundle_config", "diff": diff},
                   summary="actualizar configuración de paquetes de exportación")


def _apply_update_export_bundle_config(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    row = _get_or_create(ctx, ExportBundleConfig)
    apply_diff(row, diff_row(row, args))
    ctx.db.commit()
    return {"updated": True}


REGISTRY.register(ToolSpec(name="read_export_bundle_config",
                           description="Lee la configuración de paquetes de exportación.",
                           category="read", input_schema=Empty,
                           handler=_read_export_bundle_config, personas=frozenset({"admin"})))
REGISTRY.register(ToolSpec(name="update_export_bundle_config",
                           description="Actualiza la configuración de paquetes de exportación.",
                           category="config", input_schema=BundlePatch,
                           handler=_handle_update_export_bundle_config,
                           personas=frozenset({"admin"}), destructive=True, requires_confirmation=True))
register_applier("update_export_bundle_config", _apply_update_export_bundle_config)
