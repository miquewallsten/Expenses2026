# Agent Platform Remaining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Agent Platform implementation by adding missing components from the spec: platform usage monitoring, accounting/work tools organization, frontend workspace components, and security hardening.

**Architecture:** The core backend is complete. Remaining work focuses on: (1) organizing tools by domain, (2) adding usage monitoring for super admin, (3) building frontend workspace components, (4) enforcing tool permissions, and (5) workflow integration.

**Tech Stack:** Python/FastAPI (backend), Next.js 16/React (frontend), SQLAlchemy, PostgreSQL

---

## Current State Summary

### COMPLETED (from previous plan)

**Backend - Platform Level:**
- ✅ `packages/core/platform/models_platform.py` - PlatformTenant, PlatformLLMProvider, PlatformAgentDefinition, PlatformUsageLog
- ✅ `packages/modules/agent/models_tenant.py` - TenantAgentSession, TenantAgentMemory, TenantWorkflowProgress
- ✅ Database migrations with foreign key constraints
- ✅ `packages/modules/agent/core/memory.py` - TenantMemoryService
- ✅ `packages/modules/agent/core/workflow.py` - WorkflowService
- ✅ `packages/modules/agent/core/llm_provider_service.py` - LLM configuration resolution
- ✅ `packages/modules/agent/core/engine.py` - Supports `agent_definition` parameter for DB-driven routing
- ✅ `packages/modules/agent/core/orchestrator.py` - AgentOrchestrator routes via agent definitions
- ✅ `packages/modules/agent/tools/platform/tenant_tools.py` - create_tenant, list_tenants, update_tenant, suspend_tenant
- ✅ `packages/modules/agent/tools/platform/provider_tools.py` - create_provider, list_providers, update_provider
- ✅ `packages/modules/agent/api/platform_router.py` - Platform management API
- ✅ `packages/modules/agent/api/agent_router.py` - Tenant agent chat API
- ✅ `scripts/seed_agent_definitions.py` - Seeds 5 agent personas (super-admin, admin-config, accounting-config, accountant-work, employee)
- ✅ Tests for platform models, tenant models, workflow, memory, and platform tools

**Frontend:**
- ✅ `web/context/AgentContext.tsx` - React context for agent sessions
- ✅ `web/hooks/useAgent.ts` - useAgent hook
- ✅ `web/components/agent/AgentRail.tsx` - Collapsible sidebar
- ✅ `web/components/agent/AgentChat.tsx` - Chat interface
- ✅ `web/components/agent/AdminAgentChat.tsx` - Admin-specific chat

**Existing Tools (flat structure):**
- ✅ `tools/admin_tools.py` - User management, announcements, company config, workflow updates
- ✅ `tools/expense_ops.py` - Create expense, approvals, rejections, status checks
- ✅ `tools/ai_policy.py` - AI policy management
- ✅ `tools/accounting_category.py` - Accounting categories
- ✅ `tools/read_tools.py` - Read operations
- ✅ `tools/org.py` - Organizational tools (legal entities, cost centers, clients)
- ✅ `tools/rbac.py` - Role-based access control
- ✅ `tools/workflow.py` - Workflow management
- ✅ `tools/readiness_tools.py` - Tenant readiness checks

### NOT COMPLETED (from Spec)

**Backend - Missing:**
1. ❌ `tools/platform/usage_tools.py` - Usage monitoring for super admin
2. ❌ `tools/accounting/` directory with domain-organized tools
3. ❌ `tools/work/` directory with execution tools
4. ❌ Tool permission enforcement (allowed_tools from DB)
5. ❌ Rate limiting at API layer
6. ❌ Workflow state machine integration with onboarding flows
7. ❌ Audit logging for all agent actions (partial - audit record exists but needs expansion)

**Frontend - Missing:**
1. ❌ `AgentOrchestrator.tsx` - Top-level context provider (spec shows it but AgentContext exists)
2. ❌ `AgentWorkspace.tsx` - Full-screen workspace for complex tasks
3. ❌ `AgentMessage.tsx` - Message bubble with actions
4. ❌ `AgentInput.tsx` - Text input with suggestions
5. ❌ `AgentStatus.tsx` - Typing indicator, progress
6. ❌ Persona-specific agent components

**API - Missing:**
1. ❌ Workflow endpoints in tenant router (POST /api/agent/workflow/:company_id/start, etc.)
2. ❌ Memory management endpoints (GET/DELETE /api/agent/memory/:company_id)

---

## Implementation Tasks

### Task 1: Platform Usage Tools

**Files:**
- Create: `packages/modules/agent/tools/platform/usage_tools.py`
- Modify: `packages/modules/agent/tools/platform/__init__.py`

**Description:** Add tools for Super Admin to monitor platform usage: tenant usage stats, cost analytics, rate limit management.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_platform_usage_tools.py
"""Tests for platform usage monitoring tools."""

import pytest
from packages.modules.agent.core.context import AgentContext
from packages.modules.agent.core.registry import REGISTRY
from packages.modules.agent.tools.platform.usage_tools import *


def test_get_platform_usage_stats_empty_db(db, super_admin_context):
    """Test get_platform_usage_stats with no usage data."""
    result = REGISTRY.dispatch("get_platform_usage_stats", {}, super_admin_context)
    assert result.ok
    assert "total_requests" in result.data
    assert result.data["total_requests"] == 0


def test_get_platform_usage_stats_with_data(db, super_admin_context, platform_usage_log):
    """Test get_platform_usage_stats with usage data."""
    result = REGISTRY.dispatch("get_platform_usage_stats", {}, super_admin_context)
    assert result.ok
    assert result.data["total_requests"] >= 1


def test_get_tenant_usage_breakdown(db, super_admin_context, platform_tenant):
    """Test getting per-tenant usage breakdown."""
    result = REGISTRY.dispatch("get_tenant_usage_breakdown", {}, super_admin_context)
    assert result.ok
    assert "tenants" in result.data


def test_export_usage_csv(db, super_admin_context):
    """Test exporting usage data as CSV."""
    result = REGISTRY.dispatch("export_usage_csv", 
        {"start_date": "2026-01-01", "end_date": "2026-12-31"}, 
        super_admin_context
    )
    assert result.ok
    assert "csv_data" in result.data


def test_usage_tools_not_available_to_tenant_admin(db, tenant_admin_context):
    """Verify usage tools are restricted to super admin."""
    # These tools should not be available to regular tenant admins
    allowed = tenant_admin_context.get_allowed_tools()
    assert "get_platform_usage_stats" not in allowed
    assert "get_tenant_usage_breakdown" not in allowed
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_platform_usage_tools.py -v`
Expected: FAIL with module not found or tool not registered

- [ ] **Step 3: Implement the usage tools**

```python
# packages/modules/agent/tools/platform/usage_tools.py
"""Platform usage monitoring tools for Super Admin."""

from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from packages.core.platform.models_platform import PlatformUsageLog, PlatformTenant
from packages.modules.agent.core.context import AgentContext
from packages.modules.agent.core.registry import REGISTRY, ToolResult


def _get_platform_usage_stats(ctx: AgentContext, args: dict[str, Any]) -> ToolResult:
    """Get aggregated platform usage statistics.
    
    Returns total requests, success rate, token usage, and costs.
    Only available to super admin.
    """
    db: Session = ctx.db
    
    # Total requests
    total = db.query(func.count(PlatformUsageLog.id)).scalar() or 0
    
    # Successful requests
    successful = db.query(func.count(PlatformUsageLog.id)).filter(
        PlatformUsageLog.ok == True
    ).scalar() or 0
    
    # Total tokens and costs
    tokens_in = db.query(func.sum(PlatformUsageLog.input_tokens)).scalar() or 0
    tokens_out = db.query(func.sum(PlatformUsageLog.output_tokens)).scalar() or 0
    cost_in = db.query(func.sum(PlatformUsageLog.cost_input)).scalar() or 0
    cost_out = db.query(func.sum(PlatformUsageLog.cost_output)).scalar() or 0
    
    return ToolResult(
        ok=True,
        summary=f"Platform usage: {total} requests, {successful} successful ({successful/total*100:.1f}% success rate)",
        data={
            "total_requests": total,
            "successful_requests": successful,
            "success_rate": successful / total if total > 0 else 0,
            "total_input_tokens": tokens_in,
            "total_output_tokens": tokens_out,
            "total_cost": float(cost_in + cost_out),
        }
    )


def _get_tenant_usage_breakdown(ctx: AgentContext, args: dict[str, Any]) -> ToolResult:
    """Get usage breakdown by tenant.
    
    Returns per-tenant request counts, token usage, and costs.
    Only available to super admin.
    """
    db: Session = ctx.db
    
    # Query usage by tenant
    results = db.query(
        PlatformUsageLog.tenant_id,
        func.count(PlatformUsageLog.id).label("requests"),
        func.sum(PlatformUsageLog.input_tokens).label("input_tokens"),
        func.sum(PlatformUsageLog.output_tokens).label("output_tokens"),
        func.sum(PlatformUsageLog.cost_input + PlatformUsageLog.cost_output).label("total_cost"),
    ).group_by(PlatformUsageLog.tenant_id).all()
    
    # Get tenant names
    tenant_map = {t.id: t.name for t in db.query(PlatformTenant).all()}
    
    tenants = []
    for row in results:
        tenants.append({
            "tenant_id": row.tenant_id,
            "tenant_name": tenant_map.get(row.tenant_id, "Unknown"),
            "requests": row.requests,
            "input_tokens": row.input_tokens or 0,
            "output_tokens": row.output_tokens or 0,
            "total_cost": float(row.total_cost or 0),
        })
    
    return ToolResult(
        ok=True,
        summary=f"Usage breakdown for {len(tenants)} tenants",
        data={"tenants": tenants}
    )


def _export_usage_csv(ctx: AgentContext, args: dict[str, Any]) -> ToolResult:
    """Export usage data as CSV.
    
    Args:
        start_date: ISO date string (YYYY-MM-DD)
        end_date: ISO date string (YYYY-MM-DD)
        tenant_id: Optional tenant ID to filter
    
    Only available to super admin.
    """
    db: Session = ctx.db
    
    start_date = datetime.fromisoformat(args.get("start_date", "2026-01-01"))
    end_date = datetime.fromisoformat(args.get("end_date", datetime.now().isoformat()))
    tenant_id = args.get("tenant_id")
    
    query = db.query(PlatformUsageLog).filter(
        PlatformUsageLog.created_at >= start_date,
        PlatformUsageLog.created_at <= end_date,
    )
    
    if tenant_id:
        query = query.filter(PlatformUsageLog.tenant_id == tenant_id)
    
    logs = query.order_by(PlatformUsageLog.created_at).all()
    
    # Generate CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "timestamp", "tenant_id", "agent_key", "provider_id",
        "input_tokens", "output_tokens", "cost_input", "cost_output", "ok"
    ])
    
    for log in logs:
        writer.writerow([
            log.created_at.isoformat(),
            log.tenant_id,
            log.agent_key,
            log.provider_id,
            log.input_tokens,
            log.output_tokens,
            float(log.cost_input) if log.cost_input else 0,
            float(log.cost_output) if log.cost_output else 0,
            log.ok,
        ])
    
    return ToolResult(
        ok=True,
        summary=f"Exported {len(logs)} usage records",
        data={"csv_data": output.getvalue()}
    )


# Register tools
REGISTRY.register(
    name="get_platform_usage_stats",
    fn=_get_platform_usage_stats,
    schema={
        "type": "object",
        "properties": {},
    },
    allowed_personas=["super_admin"],
)

REGISTRY.register(
    name="get_tenant_usage_breakdown",
    fn=_get_tenant_usage_breakdown,
    schema={
        "type": "object",
        "properties": {},
    },
    allowed_personas=["super_admin"],
)

REGISTRY.register(
    name="export_usage_csv",
    fn=_export_usage_csv,
    schema={
        "type": "object",
        "properties": {
            "start_date": {"type": "string", "format": "date"},
            "end_date": {"type": "string", "format": "date"},
            "tenant_id": {"type": "integer"},
        },
    },
    allowed_personas=["super_admin"],
)
```

- [ ] **Step 4: Update __init__.py to export usage_tools**

```python
# packages/modules/agent/tools/platform/__init__.py
"""Platform tools for Super Admin — tenant, provider, and usage management."""

from . import tenant_tools  # noqa: F401
from . import provider_tools  # noqa: F401
from . import usage_tools  # noqa: F401

__all__ = ["tenant_tools", "provider_tools", "usage_tools"]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_platform_usage_tools.py -v`
Expected: PASS with all tests green

- [ ] **Step 6: Commit**

```bash
git add packages/modules/agent/tools/platform/usage_tools.py
git add packages/modules/agent/tools/platform/__init__.py
git add tests/test_platform_usage_tools.py
git commit -m "feat(agent): add platform usage monitoring tools for super admin

- get_platform_usage_stats: aggregated stats
- get_tenant_usage_breakdown: per-tenant breakdown
- export_usage_csv: CSV export for billing

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Tool Permission Enforcement

**Files:**
- Modify: `packages/modules/agent/core/engine.py`
- Modify: `packages/modules/agent/core/context.py`
- Modify: `packages/modules/agent/core/registry.py`
- Create: `tests/test_tool_permissions.py`

**Description:** Enforce that agents can only use tools listed in their `allowed_tools` from the database definition.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_tool_permissions.py
"""Tests for tool permission enforcement."""

import pytest
from packages.modules.agent.core.context import AgentContext
from packages.modules.agent.core.registry import REGISTRY, ToolResult


def test_admin_cannot_use_super_admin_tools(db, admin_context, mock_agent_definition):
    """Admin agent should not be able to use super admin tools."""
    # admin_context uses admin-config agent definition
    # which does NOT include create_tenant
    
    result = REGISTRY.dispatch("create_tenant", {"name": "Test", "slug": "test"}, admin_context)
    
    assert result.ok == False
    assert "not allowed" in result.error.lower() or "permission" in result.error.lower()


def test_employee_cannot_use_admin_tools(db, employee_context):
    """Employee agent should not be able to use admin tools."""
    # employee_context uses employee agent definition
    # which only has create_expense, check_reimbursement_status, list_my_expenses
    
    result = REGISTRY.dispatch("invite_user", {"email": "test@example.com"}, employee_context)
    
    assert result.ok == False
    assert "not allowed" in result.error.lower()


def test_allowed_tool_succeeds(db, admin_context):
    """Admin should be able to use tools in its allowed list."""
    # admin-config has read_company_setup in allowed_tools
    result = REGISTRY.dispatch("read_company_setup", {}, admin_context)
    
    # Should not fail with permission error
    # (might fail for other reasons like missing data, but not permission)
    assert result.ok or "not allowed" not in (result.error or "").lower()


def test_super_admin_can_use_all_platform_tools(db, super_admin_context):
    """Super admin should have access to all platform tools."""
    result = REGISTRY.dispatch("get_platform_usage_stats", {}, super_admin_context)
    assert result.ok == True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_tool_permissions.py -v`
Expected: FAIL - tools currently execute without permission check

- [ ] **Step 3: Implement permission check in registry**

The check needs to happen in `REGISTRY.dispatch()` and use the `allowed_tools` from the agent context.

```python
# packages/modules/agent/core/registry.py (modify dispatch method)
def dispatch(self, name: str, args: dict[str, Any], ctx: AgentContext) -> ToolResult:
    """Dispatch a tool by name with permission check.
    
    Raises PermissionError if the tool is not in the agent's allowed_tools.
    """
    if name not in self._tools:
        return ToolResult(ok=False, summary=f"Tool '{name}' not found", error="tool_not_found")
    
    # Permission check: verify tool is allowed for this agent
    allowed_tools = getattr(ctx, 'allowed_tools', None)
    if allowed_tools is not None and name not in allowed_tools:
        return ToolResult(
            ok=False,
            summary=f"Tool '{name}' is not available to this agent",
            error="permission_denied"
        )
    
    tool = self._tools[name]
    try:
        return tool.fn(ctx, args)
    except Exception as e:
        return ToolResult(ok=False, summary=str(e), error="execution_error")
```

- [ ] **Step 4: Add allowed_tools to AgentContext**

```python
# packages/modules/agent/core/context.py (modify AgentContext dataclass)
@dataclass
class AgentContext:
    db: Any
    company_id: int
    user_id: int
    user_email: str
    user_role: str
    persona: Persona
    locale: str = "es"
    session_id: str = ""
    allowed_tools: list[str] | None = None  # NEW: from agent definition
```

- [ ] **Step 5: Populate allowed_tools in engine.py**

```python
# packages/modules/agent/core/engine.py (in run_turn function, after agent_definition resolution)
    # ... existing code ...
    
    # Resolve tools and prompt
    if agent_definition:
        # DB-driven override
        system_prompt = agent_definition.system_prompt
        allowed_tools_json = agent_definition.allowed_tools
        
        # Handle cases where allowed_tools might be a MagicMock or not a string
        if isinstance(allowed_tools_json, str):
            tools_list = json.loads(allowed_tools_json) if allowed_tools_json else []
        else:
            tools_list = []
        
        # Set allowed_tools on context for permission enforcement
        ctx.allowed_tools = tools_list
        
        # Filter registry for these specific tools
        tools = [REGISTRY.get(t) for t in tools_list if REGISTRY.get(t)]
        # Convert to Ollama format
        tools = [t.to_ollama_tool() for t in tools]
    else:
        # Legacy persona-based defaults
        tools = REGISTRY.to_ollama_tools(persona)
        system_prompt = _system_prompt(
            persona, user, company_id, user_message=user_message, db=db,
        )
        # Legacy: get allowed tools from persona mapping
        ctx.allowed_tools = _get_persona_allowed_tools(persona)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pytest tests/test_tool_permissions.py -v`
Expected: PASS with permission checks working

- [ ] **Step 7: Commit**

```bash
git add packages/modules/agent/core/context.py
git add packages/modules/agent/core/registry.py
git add packages/modules/agent/core/engine.py
git add tests/test_tool_permissions.py
git commit -m "feat(agent): enforce tool permissions from agent definition

- Add allowed_tools to AgentContext
- Check permissions in REGISTRY.dispatch()
- Block unauthorized tool access

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Workflow API Endpoints

**Files:**
- Modify: `packages/modules/agent/api/agent_router.py`
- Create: `tests/test_workflow_api.py`

**Description:** Add workflow state machine endpoints for onboarding flows.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_workflow_api.py
"""Tests for workflow API endpoints."""

import pytest
from fastapi.testclient import TestClient
from apps.api.main import app


def test_start_workflow(client: TestClient, auth_headers, company_id):
    """Test starting a new workflow."""
    response = client.post(
        f"/api/agent/workflow/{company_id}/start",
        headers=auth_headers,
        json={"workflow_key": "onboarding"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] == True
    assert data["workflow_key"] == "onboarding"
    assert data["current_step"] == 0


def test_get_workflow_progress(client: TestClient, auth_headers, company_id, workflow_progress):
    """Test getting workflow progress."""
    response = client.get(
        f"/api/agent/workflow/{company_id}",
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["workflow_key"] == "onboarding"


def test_advance_workflow(client: TestClient, auth_headers, company_id, workflow_progress):
    """Test advancing workflow to next step."""
    response = client.post(
        f"/api/agent/workflow/{company_id}/advance",
        headers=auth_headers,
        json={"workflow_key": "onboarding", "context": {"company_name": "Test"}}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["current_step"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_workflow_api.py -v`
Expected: FAIL - endpoints don't exist

- [ ] **Step 3: Add workflow endpoints to agent_router.py**

```python
# packages/modules/agent/api/agent_router.py (add to file)

from ..core.workflow import WORKFLOW_SERVICE
from ..models_tenant import TenantWorkflowProgress

# ... existing code ...

# ── Workflow Endpoints ─────────────────────────────────────────────────────

class StartWorkflowRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workflow_key: str = Field(..., min_length=1, max_length=64)


class AdvanceWorkflowRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workflow_key: str = Field(..., min_length=1, max_length=64)
    context: dict[str, Any] | None = None


class WorkflowResponse(BaseModel):
    ok: bool
    workflow_key: str
    current_step: int
    total_steps: int
    completed_steps: list[int]
    context: dict[str, Any]
    error: str | None = None


@router.post("/workflow/{cid}/start", response_model=WorkflowResponse)
def start_workflow(
    cid: int,
    body: StartWorkflowRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowResponse:
    """Start a new workflow for a company."""
    require_same_company(cid, current_user)
    
    workflow = WORKFLOW_SERVICE.start_workflow(
        db=db,
        company_id=cid,
        workflow_key=body.workflow_key,
    )
    
    return WorkflowResponse(
        ok=True,
        workflow_key=workflow.workflow_key,
        current_step=workflow.current_step,
        total_steps=workflow.total_steps,
        completed_steps=workflow.completed_steps,
        context=workflow.context,
    )


@router.get("/workflow/{cid}", response_model=WorkflowResponse)
def get_workflow(
    cid: int,
    workflow_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowResponse:
    """Get current workflow progress for a company."""
    require_same_company(cid, current_user)
    
    workflow = WORKFLOW_SERVICE.get_workflow(
        db=db,
        company_id=cid,
        workflow_key=workflow_key,
    )
    
    if not workflow:
        return WorkflowResponse(
            ok=False,
            workflow_key=workflow_key,
            current_step=0,
            total_steps=0,
            completed_steps=[],
            context={},
            error="workflow_not_found",
        )
    
    return WorkflowResponse(
        ok=True,
        workflow_key=workflow.workflow_key,
        current_step=workflow.current_step,
        total_steps=workflow.total_steps,
        completed_steps=workflow.completed_steps,
        context=workflow.context,
    )


@router.post("/workflow/{cid}/advance", response_model=WorkflowResponse)
def advance_workflow(
    cid: int,
    body: AdvanceWorkflowRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowResponse:
    """Advance workflow to next step."""
    require_same_company(cid, current_user)
    
    workflow = WORKFLOW_SERVICE.advance(
        db=db,
        company_id=cid,
        workflow_key=body.workflow_key,
        context=body.context,
    )
    
    if not workflow:
        return WorkflowResponse(
            ok=False,
            workflow_key=body.workflow_key,
            current_step=0,
            total_steps=0,
            completed_steps=[],
            context={},
            error="workflow_not_found",
        )
    
    return WorkflowResponse(
        ok=True,
        workflow_key=workflow.workflow_key,
        current_step=workflow.current_step,
        total_steps=workflow.total_steps,
        completed_steps=workflow.completed_steps,
        context=workflow.context,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_workflow_api.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/modules/agent/api/agent_router.py
git add tests/test_workflow_api.py
git commit -m "feat(agent): add workflow state machine API endpoints

- POST /api/agent/workflow/{cid}/start
- GET /api/agent/workflow/{cid}
- POST /api/agent/workflow/{cid}/advance

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Frontend AgentWorkspace Component

**Files:**
- Create: `web/components/agent/AgentWorkspace.tsx`
- Create: `web/components/agent/AgentMessage.tsx`
- Create: `web/components/agent/AgentInput.tsx`
- Create: `web/components/agent/AgentStatus.tsx`

**Description:** Create the full-screen workspace component for complex agent tasks, along with supporting UI components.

- [ ] **Step 1: Create AgentMessage component**

```tsx
// web/components/agent/AgentMessage.tsx
"use client";

import type { AgentMessage as AgentMessageType } from "@/context/AgentContext";

interface AgentMessageProps {
  message: AgentMessageType;
  onAction?: (action: string, data?: unknown) => void;
}

export function AgentMessage({ message, onAction }: AgentMessageProps) {
  const isUser = message.role === "user";
  
  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}
    >
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? "bg-indigo-600/30 text-white"
            : "bg-zinc-800 text-white/90"
        }`}
      >
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        <span className="text-[10px] text-white/40 mt-1 block">
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create AgentInput component**

```tsx
// web/components/agent/AgentInput.tsx
"use client";

import { useState, type FormEvent } from "react";

interface AgentInputProps {
  onSend: (message: string) => void;
  isTyping: boolean;
  placeholder?: string;
  suggestions?: string[];
}

export function AgentInput({ 
  onSend, 
  isTyping, 
  placeholder = "Type a message...",
  suggestions = [],
}: AgentInputProps) {
  const [input, setInput] = useState("");
  
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isTyping) {
      onSend(input.trim());
      setInput("");
    }
  };
  
  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
  };
  
  return (
    <div className="border-t border-white/[0.07] bg-zinc-900 p-4">
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSuggestionClick(s)}
              className="text-[11px] px-2.5 py-1 rounded-full bg-zinc-800 text-white/60 hover:bg-zinc-700 hover:text-white/80 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          disabled={isTyping}
          className="flex-1 bg-zinc-800 border border-white/[0.07] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || isTyping}
          className="px-4 py-2.5 bg-indigo-600/30 text-indigo-300/80 rounded-lg text-sm font-medium hover:bg-indigo-600/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isTyping ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Create AgentStatus component**

```tsx
// web/components/agent/AgentStatus.tsx
"use client";

interface AgentStatusProps {
  isTyping: boolean;
  currentStep?: number;
  totalSteps?: number;
  statusMessage?: string;
}

export function AgentStatus({ 
  isTyping, 
  currentStep, 
  totalSteps, 
  statusMessage 
}: AgentStatusProps) {
  if (!isTyping && !statusMessage) {
    return null;
  }
  
  return (
    <div className="px-4 py-2 bg-zinc-800/50 border-b border-white/[0.07]">
      <div className="flex items-center gap-2">
        {isTyping && (
          <>
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400/70 animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400/70 animate-pulse [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400/70 animate-pulse [animation-delay:300ms]" />
            </div>
            <span className="text-[11px] text-white/60">Processing...</span>
          </>
        )}
        
        {statusMessage && !isTyping && (
          <span className="text-[11px] text-white/60">{statusMessage}</span>
        )}
        
        {currentStep !== undefined && totalSteps !== undefined && (
          <span className="text-[11px] text-white/40 ml-auto">
            Step {currentStep + 1} of {totalSteps}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create AgentWorkspace component**

```tsx
// web/components/agent/AgentWorkspace.tsx
"use client";

import { useState, useEffect } from "react";
import { useAgent } from "@/hooks/useAgent";
import { AgentMessage } from "./AgentMessage";
import { AgentInput } from "./AgentInput";
import { AgentStatus } from "./AgentStatus";

interface AgentWorkspaceProps {
  agentKey: string;
  title: string;
  description?: string;
  onClose: () => void;
  suggestions?: string[];
  workflowSteps?: string[];
}

export function AgentWorkspace({
  agentKey,
  title,
  description,
  onClose,
  suggestions = [],
  workflowSteps,
}: AgentWorkspaceProps) {
  const { messages, isTyping, chat, sessionId } = useAgent(agentKey);
  const [currentStep, setCurrentStep] = useState(0);
  const [showWelcome, setShowWelcome] = useState(true);
  
  const messagesEndRef = useState<HTMLDivElement | null>(null);
  
  useEffect(() => {
    // Scroll to bottom when new messages arrive
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);
  
  const handleSend = async (message: string) => {
    setShowWelcome(false);
    await chat(message);
  };
  
  return (
    <div className="fixed inset-0 bg-zinc-950 z-50 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07] bg-zinc-900">
        <div>
          <h1 className="text-sm font-medium text-white">{title}</h1>
          {description && (
            <p className="text-[11px] text-white/60">{description}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/[0.04] rounded-lg transition-colors"
          aria-label="Close workspace"
        >
          <svg
            className="w-5 h-5 text-white/60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </header>
      
      {/* Status bar */}
      <AgentStatus
        isTyping={isTyping}
        currentStep={workflowSteps ? currentStep : undefined}
        totalSteps={workflowSteps?.length}
      />
      
      {/* Messages area */}
      <main className="flex-1 overflow-y-auto p-4">
        {showWelcome && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-indigo-600/30 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-indigo-300/80"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H6a2 2 0 01-2-2V6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2h-3m-4 4l-4-4m0 0l4-4m-4 4h12"
                />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-white mb-2">
              How can I help you today?
            </h2>
            {suggestions.length > 0 && (
              <p className="text-[11px] text-white/40 mb-4">
                Try one of these suggestions below
              </p>
            )}
          </div>
        )}
        
        {messages.map((message) => (
          <AgentMessage key={message.id} message={message} />
        ))}
        
        <div ref={messagesEndRef} />
      </main>
      
      {/* Input area */}
      <AgentInput
        onSend={handleSend}
        isTyping={isTyping}
        placeholder="Ask a question..."
        suggestions={showWelcome && messages.length === 0 ? suggestions : []}
      />
    </div>
  );
}
```

- [ ] **Step 5: Export components from index**

```tsx
// web/components/agent/index.ts
export { AgentRail } from "./AgentRail";
export { AgentChat } from "./AgentChat";
export { AgentWorkspace } from "./AgentWorkspace";
export { AgentMessage } from "./AgentMessage";
export { AgentInput } from "./AgentInput";
export { AgentStatus } from "./AgentStatus";
export { AdminAgentChat } from "./AdminAgentChat";
```

- [ ] **Step 6: Commit**

```bash
git add web/components/agent/AgentWorkspace.tsx
git add web/components/agent/AgentMessage.tsx
git add web/components/agent/AgentInput.tsx
git add web/components/agent/AgentStatus.tsx
git add web/components/agent/index.ts
git commit -m "feat(web): add AgentWorkspace and supporting components

- AgentWorkspace: full-screen workspace for complex tasks
- AgentMessage: message bubble component
- AgentInput: text input with suggestions
- AgentStatus: typing indicator and progress

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Memory Management API Endpoints

**Files:**
- Modify: `packages/modules/agent/api/agent_router.py`
- Create: `tests/test_memory_api.py`

**Description:** Add endpoints for managing tenant agent memory (learned preferences).

- [ ] **Step 1: Write the failing test**

```python
# tests/test_memory_api.py
"""Tests for memory management API endpoints."""

import pytest
from fastapi.testclient import TestClient
from apps.api.main import app


def test_list_memory(client: TestClient, auth_headers, company_id, agent_memory):
    """Test listing agent memories."""
    response = client.get(
        f"/api/agent/memory/{company_id}",
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "memories" in data
    assert len(data["memories"]) >= 1


def test_delete_memory(client: TestClient, auth_headers, company_id, agent_memory):
    """Test deleting a specific memory."""
    memory_key = agent_memory.key
    
    # First, verify it exists
    response = client.get(f"/api/agent/memory/{company_id}", headers=auth_headers)
    assert response.status_code == 200
    
    # Delete it
    response = client.delete(
        f"/api/agent/memory/{company_id}/{memory_key}",
        headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["ok"] == True
    
    # Verify it's gone
    response = client.get(f"/api/agent/memory/{company_id}", headers=auth_headers)
    memories = response.json()["memories"]
    assert not any(m["key"] == memory_key for m in memories)


def test_memory_isolation_between_tenants(
    client: TestClient, 
    auth_headers, 
    company_id,
    other_company_id,
    other_auth_headers,
    agent_memory
):
    """Verify memory isolation between tenants."""
    # Company 1 can see its memory
    response = client.get(
        f"/api/agent/memory/{company_id}",
        headers=auth_headers
    )
    assert len(response.json()["memories"]) >= 1
    
    # Company 2 cannot see Company 1's memory
    response = client.get(
        f"/api/agent/memory/{other_company_id}",
        headers=other_auth_headers
    )
    memories = response.json()["memories"]
    assert not any(m["key"] == agent_memory.key for m in memories)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_memory_api.py -v`
Expected: FAIL - endpoints don't exist

- [ ] **Step 3: Add memory endpoints to agent_router.py**

```python
# packages/modules/agent/api/agent_router.py (add to file)

from ..core.memory import TENANT_MEMORY_SERVICE
from ..models_tenant import TenantAgentMemory

# ... existing code ...

# ── Memory Endpoints ───────────────────────────────────────────────────────

class MemoryResponse(BaseModel):
    ok: bool
    memories: list[dict[str, Any]]
    error: str | None = None


class MemoryDeleteResponse(BaseModel):
    ok: bool
    deleted_key: str | None = None
    error: str | None = None


@router.get("/memory/{cid}", response_model=MemoryResponse)
def list_memory(
    cid: int,
    agent_key: str = "admin",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MemoryResponse:
    """List agent memories for a company."""
    require_same_company(cid, current_user)
    
    memories = TENANT_MEMORY_SERVICE.list_memories(
        db=db,
        company_id=cid,
        agent_key=agent_key,
    )
    
    return MemoryResponse(
        ok=True,
        memories=[
            {
                "key": m.key,
                "value": m.value,
                "confidence": float(m.confidence) if m.confidence else 1.0,
                "learned_at": m.learned_at.isoformat() if m.learned_at else None,
                "last_used_at": m.last_used_at.isoformat() if m.last_used_at else None,
            }
            for m in memories
        ],
    )


@router.delete("/memory/{cid}/{key}", response_model=MemoryDeleteResponse)
def delete_memory(
    cid: int,
    key: str,
    agent_key: str = "admin",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MemoryDeleteResponse:
    """Delete a specific agent memory."""
    require_same_company(cid, current_user)
    
    deleted = TENANT_MEMORY_SERVICE.delete_memory(
        db=db,
        company_id=cid,
        agent_key=agent_key,
        key=key,
    )
    
    if not deleted:
        return MemoryDeleteResponse(
            ok=False,
            error="memory_not_found",
        )
    
    return MemoryDeleteResponse(
        ok=True,
        deleted_key=key,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_memory_api.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/modules/agent/api/agent_router.py
git add tests/test_memory_api.py
git commit -m "feat(agent): add memory management API endpoints

- GET /api/agent/memory/{cid} - list memories
- DELETE /api/agent/memory/{cid}/{key} - delete memory

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Rate Limiting at API Layer

**Files:**
- Create: `packages/core/middleware/rate_limit.py`
- Create: `packages/core/middleware/__init__.py`
- Modify: `apps/api/main.py`
- Create: `tests/test_rate_limiting.py`

**Description:** Add rate limiting to prevent abuse of agent endpoints.

- [ ] **Step 1: Create rate limiting middleware**

```python
# packages/core/middleware/__init__.py
"""Middleware components for the API."""

from .rate_limit import RateLimitMiddleware

__all__ = ["RateLimitMiddleware"]
```

```python
# packages/core/middleware/rate_limit.py
"""Rate limiting middleware for API endpoints."""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


@dataclass
class RateLimitConfig:
    """Configuration for rate limiting."""
    
    # Requests per minute per user
    requests_per_minute: int = 60
    
    # Burst allowance
    burst: int = 10
    
    # Paths to rate limit (prefix match)
    paths: tuple[str, ...] = ("/api/agent/", "/api/platform/")


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware using sliding window."""
    
    def __init__(self, app, config: RateLimitConfig | None = None):
        super().__init__(app)
        self.config = config or RateLimitConfig()
        self._requests: dict[str, list[float]] = defaultdict(list)
    
    async def dispatch(
        self, 
        request: Request, 
        call_next: Callable
    ) -> Response:
        # Check if path should be rate limited
        if not any(request.url.path.startswith(path) for path in self.config.paths):
            return await call_next(request)
        
        # Get user identifier (from auth header or IP)
        user_id = self._get_user_id(request)
        
        # Check rate limit
        now = time.time()
        minute_ago = now - 60
        
        # Clean old requests
        self._requests[user_id] = [
            t for t in self._requests[user_id] if t > minute_ago
        ]
        
        # Check limit (allow burst)
        if len(self._requests[user_id]) >= self.config.requests_per_minute + self.config.burst:
            return Response(
                content='{"ok": false, "error": "rate_limit_exceeded"}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": "60"}
            )
        
        # Record request
        self._requests[user_id].append(now)
        
        # Continue
        return await call_next(request)
    
    def _get_user_id(self, request: Request) -> str:
        """Get user identifier for rate limiting."""
        # Try auth header
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            # Use token hash as identifier
            return f"token:{hash(auth_header) % 1000000}"
        
        # Fall back to IP
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            return f"ip:{forwarded.split(',')[0].strip()}"
        
        return f"ip:{request.client.host if request.client else 'unknown'}"
```

- [ ] **Step 2: Write test for rate limiting**

```python
# tests/test_rate_limiting.py
"""Tests for rate limiting middleware."""

import pytest
from fastapi.testclient import TestClient
from apps.api.main import app


def test_rate_limit_allows_normal_usage(client: TestClient, auth_headers):
    """Normal usage should not be rate limited."""
    # Make several requests (under limit)
    for _ in range(10):
        response = client.get("/api/agent/sessions/1", headers=auth_headers)
        # Some may fail for other reasons (e.g., not found)
        # but not for rate limiting
        if response.status_code == 429:
            pytest.fail("Rate limited on normal usage")


def test_rate_limit_blocks_excessive_requests(client: TestClient, auth_headers):
    """Excessive requests should be rate limited."""
    # Make many requests quickly
    rate_limited = False
    for _ in range(100):
        response = client.get("/api/agent/sessions/1", headers=auth_headers)
        if response.status_code == 429:
            rate_limited = True
            break
    
    assert rate_limited, "Expected to be rate limited after 100 requests"


def test_rate_limit_different_users_independent(client: TestClient, auth_headers, other_auth_headers):
    """Rate limits should be independent per user."""
    # Exhaust rate limit for user 1
    for _ in range(100):
        client.get("/api/agent/sessions/1", headers=auth_headers)
    
    # User 2 should still be able to make requests
    response = client.get("/api/agent/sessions/1", headers=other_auth_headers)
    assert response.status_code != 429, "User 2 should not be rate limited"
```

- [ ] **Step 3: Add middleware to main.py**

```python
# apps/api/main.py (add near other middleware)

from packages.core.middleware import RateLimitMiddleware, RateLimitConfig

# Add after app initialization
app.add_middleware(
    RateLimitMiddleware,
    config=RateLimitConfig(
        requests_per_minute=60,
        burst=10,
        paths=("/api/agent/", "/api/platform/"),
    )
)
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_rate_limiting.py -v`

- [ ] **Step 5: Commit**

```bash
git add packages/core/middleware/
git add apps/api/main.py
git add tests/test_rate_limiting.py
git commit -m "feat(api): add rate limiting middleware

- RateLimitMiddleware with sliding window
- 60 requests/minute per user with 10 burst
- Applies to /api/agent/* and /api/platform/*

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: Organize Tools by Domain

**Files:**
- Create: `packages/modules/agent/tools/accounting/__init__.py`
- Create: `packages/modules/agent/tools/accounting/catalog_tools.py`
- Create: `packages/modules/agent/tools/accounting/mapping_tools.py`
- Create: `packages/modules/agent/tools/work/__init__.py`
- Create: `packages/modules/agent/tools/work/expense_tools.py`
- Create: `packages/modules/agent/tools/work/poliza_tools.py`
- Modify: `packages/modules/agent/tools/registry_all.py`

**Description:** Reorganize tools into domain-specific directories while maintaining backwards compatibility.

- [ ] **Step 1: Create accounting tools directory**

```python
# packages/modules/agent/tools/accounting/__init__.py
"""Accounting configuration tools for agent."""

# Import existing tools from flat structure (for backwards compatibility)
# These will be reorganized from accounting_category.py
from packages.modules.agent.tools.accounting_category import (
    # Re-export as accounting tools
)

# Future: Add mapping_tools and export_tools
```

**Note:** This task is about ORGANIZATION, not creating new tools. The tools already exist in `accounting_category.py`. The reorganization involves:

1. Creating domain directories (`accounting/`, `work/`)
2. Moving or re-exporting existing tools
3. Updating the registry to use both old and new names

- [ ] **Step 2: Create work tools directory**

```python
# packages/modules/agent/tools/work/__init__.py
"""Work execution tools for agent."""

# Import existing tools from expense_ops.py
from packages.modules.agent.tools.expense_ops import (
    _handle_create_expense,
    _handle_list_pending,
    _handle_approve,
    _handle_reject,
    _handle_reimbursement_status,
)

# These are already registered, no need to re-register
```

- [ ] **Step 3: Update registry_all.py**

```python
# packages/modules/agent/tools/registry_all.py
"""Import all tools to register them with the global registry.

This file is imported by the agent router to ensure all tools
are registered before handling requests.

Tool organization:
- platform/: Super admin tools (tenant, provider, usage management)
- accounting/: Accounting configuration tools (categories, mappings, exports)
- work/: Execution tools (expenses, categorization, polizas)
- (root): Legacy flat structure (backwards compatible)
"""

# Platform tools (super admin)
from . import platform  # noqa: F401

# Domain-organized tools
from . import accounting  # noqa: F401 (when ready)
from . import work  # noqa: F401 (when ready)

# Legacy flat structure (backwards compatible)
from . import admin_tools  # noqa: F401
from . import ai_policy  # noqa: F401
from . import config_patch  # noqa: F401
from . import creative  # noqa: F401
from . import diagnostic  # noqa: F401
from . import expense_ops  # noqa: F401
from . import finance_copilot  # noqa: F401
from . import infra  # noqa: F401
from . import ingestion  # noqa: F401
from . import knowledge_tools  # noqa: F401
from . import memory  # noqa: F401
from . import org  # noqa: F401
from . import rbac  # noqa: F401
from . import read_tools  # noqa: F401
from . import readiness_tools  # noqa: F401
from . import search  # noqa: F401
from . import settings  # noqa: F401
from . import workflow  # noqa: F401

__all__ = [
    "platform",
    "admin_tools",
    "ai_policy",
    # ... rest
]
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `pytest tests/ -v --tb=short`

- [ ] **Step 5: Commit**

```bash
git add packages/modules/agent/tools/accounting/
git add packages/modules/agent/tools/work/
git add packages/modules/agent/tools/registry_all.py
git commit -m "refactor(agent): organize tools into domain directories

- Create accounting/ directory for accounting tools
- Create work/ directory for execution tools
- Maintain backwards compatibility via re-exports
- Update registry_all.py

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: Connect Frontend to Backend API

**Files:**
- Modify: `web/context/AgentContext.tsx`
- Modify: `web/hooks/useAgent.ts`
- Create: `web/lib/agent-api.ts`

**Description:** Replace simulated responses with actual backend API calls.

- [ ] **Step 1: Create agent API client**

```typescript
// web/lib/agent-api.ts
/**
 * Agent API client for backend communication.
 */

import { getApiUrl, getAuthHeaders } from "./session";

export interface ChatRequest {
  message: string;
  session_id?: string;
  persona?: string;
  hard_mode?: boolean;
}

export interface ChatResponse {
  ok: boolean;
  session_id: string;
  content: string;
  tool_calls: Array<{
    tool: string;
    status: string;
    summary: string;
    duration_ms: number;
  }>;
  pending: Array<{
    receipt_id: string;
    tool: string;
    summary: string;
  }>;
  error?: string;
}

export interface WorkflowProgress {
  ok: boolean;
  workflow_key: string;
  current_step: number;
  total_steps: number;
  completed_steps: number[];
  context: Record<string, unknown>;
  error?: string;
}

/**
 * Send a chat message to the agent.
 */
export async function sendChatMessage(
  companyId: number,
  request: ChatRequest
): Promise<ChatResponse> {
  const response = await fetch(`${getApiUrl()}/agent/chat/${companyId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Start a workflow.
 */
export async function startWorkflow(
  companyId: number,
  workflowKey: string
): Promise<WorkflowProgress> {
  const response = await fetch(`${getApiUrl()}/agent/workflow/${companyId}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ workflow_key: workflowKey }),
  });

  if (!response.ok) {
    throw new Error(`Workflow start failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get workflow progress.
 */
export async function getWorkflowProgress(
  companyId: number,
  workflowKey: string
): Promise<WorkflowProgress> {
  const response = await fetch(
    `${getApiUrl()}/agent/workflow/${companyId}?workflow_key=${workflowKey}`,
    {
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error(`Workflow fetch failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Advance workflow.
 */
export async function advanceWorkflow(
  companyId: number,
  workflowKey: string,
  context?: Record<string, unknown>
): Promise<WorkflowProgress> {
  const response = await fetch(`${getApiUrl()}/agent/workflow/${companyId}/advance`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ workflow_key: workflowKey, context }),
  });

  if (!response.ok) {
    throw new Error(`Workflow advance failed: ${response.status}`);
  }

  return response.json();
}

/**
 * List agent memories.
 */
export async function listMemories(
  companyId: number,
  agentKey: string = "admin"
): Promise<{ ok: boolean; memories: Array<{ key: string; value: string }> }> {
  const response = await fetch(
    `${getApiUrl()}/agent/memory/${companyId}?agent_key=${agentKey}`,
    {
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error(`Memory list failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Delete a memory.
 */
export async function deleteMemory(
  companyId: number,
  key: string,
  agentKey: string = "admin"
): Promise<{ ok: boolean; deleted_key?: string }> {
  const response = await fetch(
    `${getApiUrl()}/agent/memory/${companyId}/${key}?agent_key=${agentKey}`,
    {
      method: "DELETE",
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error(`Memory delete failed: ${response.status}`);
  }

  return response.json();
}
```

- [ ] **Step 2: Update AgentContext to use real API**

```typescript
// web/context/AgentContext.tsx (update sendMessage function)

import { sendChatMessage } from "@/lib/agent-api";

// ... inside AgentProvider ...

const sendMessage = useCallback(
  async (agentKey: string, message: string): Promise<void> => {
    // Get company ID from session or context
    const companyId = getCompanyId(); // You'll need to implement this
    
    // Ensure session exists
    setSessions((prev) => {
      if (!prev.has(agentKey)) {
        const newMap = new Map(prev);
        newMap.set(agentKey, createSession(agentKey));
        return newMap;
      }
      return prev;
    });

    // Add user message
    const userMessage: AgentMessage = {
      id: generateId(),
      role: "user",
      content: message,
      timestamp: Date.now(),
    };

    setSessions((prev) => {
      const newMap = new Map(prev);
      const session = newMap.get(agentKey);
      if (session) {
        newMap.set(agentKey, {
          ...session,
          messages: [...session.messages, userMessage],
          isTyping: true,
        });
      }
      return newMap;
    });

    try {
      // Call real backend API
      const response = await sendChatMessage(companyId, {
        message,
        session_id: sessions.get(agentKey)?.id,
        persona: agentKey === "admin-copilot" ? "admin" : agentKey,
      });

      const assistantMessage: AgentMessage = {
        id: generateId(),
        role: "assistant",
        content: response.content,
        timestamp: Date.now(),
      };

      setSessions((prev) => {
        const newMap = new Map(prev);
        const session = newMap.get(agentKey);
        if (session) {
          newMap.set(agentKey, {
            ...session,
            id: response.session_id,
            messages: [...session.messages, assistantMessage],
            isTyping: false,
          });
        }
        return newMap;
      });
    } catch (error) {
      // Handle error
      const errorMessage: AgentMessage = {
        id: generateId(),
        role: "system",
        content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: Date.now(),
      };

      setSessions((prev) => {
        const newMap = new Map(prev);
        const session = newMap.get(agentKey);
        if (session) {
          newMap.set(agentKey, {
            ...session,
            messages: [...session.messages, errorMessage],
            isTyping: false,
          });
        }
        return newMap;
      });
    }
  },
  [sessions],
);
```

- [ ] **Step 3: Verify integration works**

Run: `cd web && npm run build`

- [ ] **Step 4: Commit**

```bash
git add web/lib/agent-api.ts
git add web/context/AgentContext.tsx
git commit -m "feat(web): connect agent context to backend API

- Create agent-api.ts client
- Replace simulated responses with real API calls
- Handle errors gracefully

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Verification Checklist

After completing all tasks:

- [ ] Run full test suite: `pytest tests/ -v`
- [ ] Run frontend build: `cd web && npm run build`
- [ ] Run linting: `cd web && npm run lint`
- [ ] Verify migration: `alembic upgrade head`
- [ ] Manual test: Start server, test agent chat, workflow, memory endpoints

## Dependencies

This plan builds on the completed work from the first implementation plan. No new database migrations are needed (tables already exist).

## Notes

- The spec's "agents/ directory" with persona files was designed before DB-driven definitions. The current implementation using `AgentDefinition` rows in the database is superior and should be kept.
- Tools are currently in a flat structure. Task 7 organizes them by domain for better maintainability, but the spec's `tools/accounting/` and `tools/work/` can be achieved via re-exports without breaking existing code.
- The spec's `AgentOrchestrator.tsx` component overlaps with the existing `AgentContext.tsx`. The plan focuses on the missing `AgentWorkspace.tsx` for complex tasks.