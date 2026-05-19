from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel

from packages.modules.agent.core.context import AgentContext
from packages.modules.agent.core.registry import REGISTRY, ToolResult, ToolSpec
from packages.core.platform.models_platform_settings import PlatformSettings
from packages.core.platform.service.mail_tester import test_smtp_connection, test_imap_connection

_log = logging.getLogger(__name__)

# ── Schemas ──────────────────────────────────────────────────────────────────

class TestMailboxArgs(BaseModel):
    type: str  # 'smtp' or 'imap'
    config: Dict[str, Any]

class UpdateMailboxArgs(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_name: Optional[str] = None
    smtp_from_email: Optional[str] = None
    imap_host: Optional[str] = None
    imap_port: Optional[int] = None
    imap_user: Optional[str] = None
    imap_password: Optional[str] = None
    imap_enabled: Optional[bool] = None

# ── Handlers ────────────────────────────────────────────────────────────────

def test_platform_mailbox_handler(ctx: AgentContext, args: TestMailboxArgs) -> ToolResult:
    import asyncio
    
    test_type = args.type
    config = args.config
    
    # Run the async test connection
    if test_type == "smtp":
        res = asyncio.run(test_smtp_connection(config))
    else:
        res = asyncio.run(test_imap_connection(config))
        
    if res.get("ok"):
        return ToolResult(ok=True, summary=res.get("message", "Connection successful"), data=res)
    else:
        return ToolResult(ok=False, summary=res.get("error", "Connection failed"), data=res)

def update_platform_mailbox_handler(ctx: AgentContext, args: UpdateMailboxArgs) -> ToolResult:
    db = ctx.db
    settings = db.query(PlatformSettings).first()
    if not settings:
        settings = PlatformSettings()
        db.add(settings)
    
    data = args.model_dump(exclude_unset=True)
    for k, v in data.items():
        if hasattr(settings, k):
            setattr(settings, k, v)
            
    db.commit()
    db.refresh(settings)
    
    return ToolResult(ok=True, summary="Platform mailbox settings updated successfully.")

# ── Registration ────────────────────────────────────────────────────────────

REGISTRY.register(
    ToolSpec(
        name="test_platform_mailbox",
        description="Verify corporate SMTP or IMAP credentials by attempting a real-time handshake.",
        category="infra",
        input_schema=TestMailboxArgs,
        handler=test_platform_mailbox_handler,
        personas=frozenset(["admin"]),
    )
)

REGISTRY.register(
    ToolSpec(
        name="update_platform_mailbox",
        description="Modify the master corporate mailbox credentials and enable/disable states.",
        category="config",
        input_schema=UpdateMailboxArgs,
        handler=update_platform_mailbox_handler,
        personas=frozenset(["admin"]),
    )
)
