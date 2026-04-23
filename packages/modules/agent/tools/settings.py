"""Report cycle + channel + auth settings tools.

All three follow the same receipt-gated update pattern. Channel settings
expose only non-secret fields on read — credentials may be written via
update but are never returned.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from packages.core.platform.models_auth_settings import CompanyAuthSettings
from packages.core.platform.models_report_cycle import ReportCycleSettings
from packages.modules.channels.models import ChannelSettings

from ..core.appliers import register_applier
from ..core.context import AgentContext
from ..core.registry import REGISTRY, ToolResult, ToolSpec
from ._common import apply_diff, diff_row, non_null, propose


class Empty(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _get_or_create(ctx: AgentContext, model, defaults: dict[str, Any] | None = None):
    row = ctx.db.query(model).filter(model.company_id == ctx.company_id).one_or_none()
    if row is None:
        row = model(company_id=ctx.company_id, **(defaults or {}))
        ctx.db.add(row)
        ctx.db.flush()
    return row


# ── Report cycle ───────────────────────────────────────────────────────────

def _read_report_cycle(ctx: AgentContext, _: Empty) -> ToolResult:
    row = ctx.db.query(ReportCycleSettings).filter(ReportCycleSettings.company_id == ctx.company_id).one_or_none()
    data = {} if row is None else {
        "enabled": row.enabled, "frequency": row.frequency,
        "day_of_week": row.day_of_week, "day_of_month": row.day_of_month,
        "time_of_day": row.time_of_day, "auto_submit": row.auto_submit,
        "bundle_statuses": row.bundle_statuses,
        "report_name_template": row.report_name_template,
        "last_run_at": row.last_run_at.isoformat() if row.last_run_at else None,
        "next_run_at": row.next_run_at.isoformat() if row.next_run_at else None,
    }
    return ToolResult(ok=True, summary="report cycle settings", data=data)


class ReportCyclePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled:              bool | None = None
    frequency:            str | None = None  # weekly | biweekly | monthly | manual
    day_of_week:          int | None = Field(default=None, ge=0, le=6)
    day_of_month:         int | None = Field(default=None, ge=1, le=28)
    time_of_day:          str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    auto_submit:          bool | None = None
    bundle_statuses:      str | None = None
    report_name_template: str | None = None


_VALID_FREQ = {"weekly", "biweekly", "monthly", "manual"}


def _handle_update_report_cycle(ctx: AgentContext, args: ReportCyclePatch) -> ToolResult:
    patch = non_null(args)
    if not patch:
        return ToolResult(ok=False, summary="sin cambios", error="empty_patch")
    if "frequency" in patch and patch["frequency"] not in _VALID_FREQ:
        return ToolResult(ok=False, summary="frecuencia inválida", error="invalid_frequency")
    row = _get_or_create(ctx, ReportCycleSettings)
    diff = diff_row(row, patch)
    ctx.db.rollback()
    if not diff:
        return ToolResult(ok=True, summary="sin cambios")
    return propose(ctx, tool_name="update_report_cycle", args=patch,
                   preview={"action": "update_report_cycle", "diff": diff},
                   summary="actualizar ciclo de reportes")


def _apply_update_report_cycle(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    row = _get_or_create(ctx, ReportCycleSettings)
    apply_diff(row, diff_row(row, args))
    ctx.db.commit()
    return {"updated": True}


REGISTRY.register(ToolSpec(name="read_report_cycle", description="Lee la configuración del ciclo de reportes.",
                           category="read", input_schema=Empty, handler=_read_report_cycle,
                           personas=frozenset({"admin"})))
REGISTRY.register(ToolSpec(name="update_report_cycle",
                           description="Actualiza la configuración del ciclo de reportes.",
                           category="config", input_schema=ReportCyclePatch,
                           handler=_handle_update_report_cycle,
                           personas=frozenset({"admin"}), destructive=True, requires_confirmation=True))
register_applier("update_report_cycle", _apply_update_report_cycle)


# ── Channel settings ───────────────────────────────────────────────────────

# Secret fields redacted on read and never echoed back in previews.
_SECRET_CHANNEL_FIELDS = {"wa_access_token", "wa_webhook_verify_token",
                          "email_webhook_secret", "email_smtp_password"}


class ChannelReadArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    channel: str = Field(..., pattern=r"^(whatsapp|email)$")


def _get_channel(ctx: AgentContext, channel: str) -> ChannelSettings | None:
    return (
        ctx.db.query(ChannelSettings)
        .filter(ChannelSettings.company_id == ctx.company_id, ChannelSettings.channel == channel)
        .one_or_none()
    )


def _channel_public_dict(row: ChannelSettings) -> dict[str, Any]:
    return {
        "channel": row.channel, "is_enabled": row.is_enabled,
        "wa_phone_number_id": row.wa_phone_number_id, "wa_waba_id": row.wa_waba_id,
        "wa_display_name": row.wa_display_name,
        "email_inbound_address": row.email_inbound_address,
        "email_smtp_host": row.email_smtp_host, "email_smtp_port": row.email_smtp_port,
        "email_smtp_user": row.email_smtp_user, "email_smtp_from": row.email_smtp_from,
        "wa_access_token_set": bool(row.wa_access_token),
        "wa_webhook_verify_token_set": bool(row.wa_webhook_verify_token),
        "email_webhook_secret_set": bool(row.email_webhook_secret),
        "email_smtp_password_set": bool(row.email_smtp_password),
    }


def _read_channel_settings(ctx: AgentContext, args: ChannelReadArgs) -> ToolResult:
    row = _get_channel(ctx, args.channel)
    return ToolResult(ok=True, summary=f"canal {args.channel}",
                      data={} if row is None else _channel_public_dict(row))


REGISTRY.register(ToolSpec(
    name="read_channel_settings",
    description="Lee la configuración de un canal (whatsapp | email). Los secretos nunca se devuelven.",
    category="read", input_schema=ChannelReadArgs, handler=_read_channel_settings,
    personas=frozenset({"admin"}),
))


class ChannelPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    channel:                str  = Field(..., pattern=r"^(whatsapp|email)$")
    is_enabled:             bool | None = None
    wa_phone_number_id:     str  | None = None
    wa_waba_id:             str  | None = None
    wa_access_token:        str  | None = None
    wa_webhook_verify_token: str | None = None
    wa_display_name:        str  | None = None
    email_inbound_address:  str  | None = None
    email_webhook_secret:   str  | None = None
    email_smtp_host:        str  | None = None
    email_smtp_port:        int  | None = None
    email_smtp_user:        str  | None = None
    email_smtp_password:    str  | None = None
    email_smtp_from:        str  | None = None


def _handle_update_channel_settings(ctx: AgentContext, args: ChannelPatch) -> ToolResult:
    patch = non_null(args)
    channel = patch.pop("channel")
    if not patch:
        return ToolResult(ok=False, summary="sin cambios", error="empty_patch")

    row = _get_channel(ctx, channel)
    if row is None:
        diff_preview = {k: {"before": None, "after": ("<set>" if k in _SECRET_CHANNEL_FIELDS else v)}
                        for k, v in patch.items()}
    else:
        raw_diff = diff_row(row, patch)
        diff_preview = {
            k: {"before": ("<set>" if k in _SECRET_CHANNEL_FIELDS and pair["before"] else pair["before"]),
                "after":  ("<set>" if k in _SECRET_CHANNEL_FIELDS else pair["after"])}
            for k, pair in raw_diff.items()
        }
        if not raw_diff:
            return ToolResult(ok=True, summary="sin cambios")

    return propose(ctx, tool_name="update_channel_settings",
                   args={"channel": channel, **patch},
                   preview={"action": "update_channel_settings", "channel": channel, "diff": diff_preview},
                   summary=f"actualizar configuración del canal {channel}")


def _apply_update_channel_settings(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    channel = str(args["channel"])
    patch = {k: v for k, v in args.items() if k != "channel" and v is not None}
    row = _get_channel(ctx, channel)
    created = False
    if row is None:
        row = ChannelSettings(company_id=ctx.company_id, channel=channel, is_enabled=False)
        ctx.db.add(row)
        ctx.db.flush()
        created = True
    apply_diff(row, diff_row(row, patch))
    ctx.db.commit()
    return {"updated": True, "created": created, "channel": channel}


REGISTRY.register(ToolSpec(
    name="update_channel_settings",
    description="Actualiza la configuración de un canal. Los campos secretos nunca se muestran en la confirmación.",
    category="config", input_schema=ChannelPatch, handler=_handle_update_channel_settings,
    personas=frozenset({"admin"}), destructive=True, requires_confirmation=True,
))
register_applier("update_channel_settings", _apply_update_channel_settings)


# ── Auth settings ──────────────────────────────────────────────────────────

def _read_auth_settings(ctx: AgentContext, _: Empty) -> ToolResult:
    row = ctx.db.query(CompanyAuthSettings).filter(
        CompanyAuthSettings.company_id == ctx.company_id,
    ).one_or_none()
    data = {} if row is None else {
        "magic_link_enabled": row.magic_link_enabled,
        "allowed_email_domains": row.allowed_email_domains,
        "sso_enabled": row.sso_enabled,
        "sso_provider": row.sso_provider,
        "sso_metadata_url_set": bool(row.sso_metadata_url),
        "session_timeout_hours": row.session_timeout_hours,
        "require_mfa": row.require_mfa,
    }
    return ToolResult(ok=True, summary="auth settings", data=data)


class AuthPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    magic_link_enabled:    bool | None = None
    allowed_email_domains: str  | None = None
    sso_enabled:           bool | None = None
    sso_provider:          str  | None = None
    sso_metadata_url:      str  | None = None
    session_timeout_hours: int  | None = Field(default=None, ge=1, le=720)
    require_mfa:           bool | None = None


def _handle_update_auth_settings(ctx: AgentContext, args: AuthPatch) -> ToolResult:
    patch = non_null(args)
    if not patch:
        return ToolResult(ok=False, summary="sin cambios", error="empty_patch")
    row = _get_or_create(ctx, CompanyAuthSettings)
    raw_diff = diff_row(row, patch)
    ctx.db.rollback()
    if not raw_diff:
        return ToolResult(ok=True, summary="sin cambios")
    # mask secret field
    diff_preview = {
        k: {"before": ("<set>" if k == "sso_metadata_url" and pair["before"] else pair["before"]),
            "after":  ("<set>" if k == "sso_metadata_url" else pair["after"])}
        for k, pair in raw_diff.items()
    }
    return propose(ctx, tool_name="update_auth_settings", args=patch,
                   preview={"action": "update_auth_settings", "diff": diff_preview},
                   summary="actualizar configuración de autenticación")


def _apply_update_auth_settings(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    row = _get_or_create(ctx, CompanyAuthSettings)
    apply_diff(row, diff_row(row, args))
    ctx.db.commit()
    return {"updated": True}


REGISTRY.register(ToolSpec(name="read_auth_settings", description="Lee la configuración de autenticación.",
                           category="read", input_schema=Empty, handler=_read_auth_settings,
                           personas=frozenset({"admin"})))
REGISTRY.register(ToolSpec(name="update_auth_settings",
                           description="Actualiza la configuración de autenticación (magic link, SSO, MFA, sesiones).",
                           category="config", input_schema=AuthPatch, handler=_handle_update_auth_settings,
                           personas=frozenset({"admin"}), destructive=True, requires_confirmation=True))
register_applier("update_auth_settings", _apply_update_auth_settings)
