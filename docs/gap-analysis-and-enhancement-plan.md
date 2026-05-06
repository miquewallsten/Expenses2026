# Financial Ops Platform → XpenseFlow AI Enhancement Plan

> Gap analysis and enhancement roadmap to transform the existing platform into XpenseFlow AI.

---

## Executive Summary

The existing `financial-ops-platform` is a **mature, production-ready codebase** with 80% of XpenseFlow AI's requirements already implemented. The enhancement plan focuses on:

1. **Architectural alignment** — renaming, rebranding, and structural changes
2. **Lola Agent orchestration** — adding the intelligent orchestrator layer
3. **Add-on marketplace** — modular installable add-ons
4. **Universal workflow engine** — upgrading the existing workflow system
5. **Agent memory (pgvector)** — already exists, needs integration with Lola

---

## What Already Exists

### ✅ Core Infrastructure

| Feature | Status | Location |
|---------|--------|----------|
| Multi-tenant architecture | ✅ Complete | `company_id` on all models |
| PostgreSQL + pgvector | ✅ Complete | `CREATE EXTENSION IF NOT EXISTS vector` |
| FastAPI backend | ✅ Complete | `apps/api/main.py` |
| Next.js 16 frontend | ✅ Complete | `web/app/` |
| Authentication (magic-link) | ✅ Complete | `apps/api/routes/auth.py` |
| i18n (Spanish default) | ✅ Complete | `next-intl`, `web/messages/` |
| Redis caching | ✅ Complete | `packages/core/cache/` |
| Rate limiting | ✅ Complete | `apps/api/rate_limit.py` |
| Celery jobs | ✅ Complete | `packages/core/jobs/` |
| Docker compose | ✅ Complete | `docker-compose.yml` |
| Alembic migrations | ✅ Complete | `alembic/` |
| Test suite | ✅ Complete | `tests/` (pytest, SQLite memory) |

### ✅ Business Modules

| Module | Status | Description |
|--------|--------|-------------|
| Expenses | ✅ Complete | CFDI parsing, SAT validation, approval routing |
| Accounting | ✅ Complete | Chart of accounts, Poliza export, accounting queue |
| Time Tracking | ✅ Complete | Projects, activities, time entries |
| Purchase Requests | ✅ Complete | Request creation, approval workflow |
| AMEX Reconciliation | ✅ Complete | Statement import, matching |
| Integrations | ✅ Complete | Public API, webhooks |
| Archive | ✅ Complete | Archive files, configs |
| Channels | ✅ Complete | WhatsApp webhook, email inbound |

### ✅ Platform Features

| Feature | Status | Location |
|---------|--------|----------|
| Workflow stages | ✅ Complete | `packages/core/platform/models_workflow_stage.py` |
| Workflow transitions | ✅ Complete | `packages/core/platform/models_workflow_transition.py` |
| Roles & permissions | ✅ Complete | `models_role.py`, `models_permission.py` |
| Audit logging | ✅ Complete | `models_audit.py`, `models_audit_event.py` |
| Projects / Cost Centers / Clients | ✅ Complete | `models_project.py`, `models_cost_center.py`, `models_client.py` |
| AI integration | ✅ Complete | `packages/modules/ai/`, `packages/modules/agent/` |
| Agent infrastructure | ✅ Complete | `packages/modules/agent/` - sessions, tools, memory |
| Category learning | ✅ Complete | `models_accounting_learning.py` |

### ✅ UI Components

| Component | Status | Notes |
|-----------|--------|-------|
| Design system | ✅ Complete | Dark-mode-first, Apple-inspired (see DESIGN.md) |
| All base components | ✅ Complete | Button, Input, Select, Modal, Table, etc. |
| Layout (Sidebar) | ✅ Complete | Fixed navigation |
| Dashboard pages | ✅ Complete | Employee, Manager, Accounting, Admin |
| Super Admin | ✅ Complete | Tenant management, agent usage, LLM config |

---

## Gaps: What Needs to Change

### 🔴 Critical Gaps

| Gap | Current State | Required State | Effort |
|-----|---------------|----------------|--------|
| **Branding** | "OpsFlow", "financial-ops" | "XpenseFlow AI", "xpenseflow" | 2 days |
| **Lola Agent** | No unified orchestrator | Persistent tenant agent with memory | 3 weeks |
| **Add-on Marketplace** | Monolithic modules | Installable add-ons with manifests | 2 weeks |
| **Workflow Engine** | Stage-based transitions | Universal workflow with step types (VALIDATION, AGENT_TASK, etc.) | 2 weeks |
| **Agent Guardrails** | None | Hardcoded restrictions (no delete_any_record, etc.) | 1 week |

### 🟡 Important Gaps

| Gap | Current State | Required State | Effort |
|-----|---------------|----------------|--------|
| **Agent Memory (pgvector)** | Exists for document embeddings | Needs Lola context memory | 1 week |
| **Agent Communication** | None | Redis pub/sub for inter-agent | 1 week |
| **Workflow Canvas UI** | None | React Flow builder | 2 weeks |
| **Notifications System** | WhatsApp + email exist | In-app bell + rules builder | 1 week |
| **SSE for Real-time** | None | Agent activity feed | 3 days |

### 🟢 Minor Gaps

| Gap | Current State | Required State | Effort |
|-----|---------------|----------------|--------|
| **User locale field** | None | `locale` field with ES/EN | 1 day |
| **Tenant lolaNickname** | None | Tenant can rename Lola | 1 day |
| **Auth abstraction** | Magic-link only | Interface for future Clerk | 2 days |
| **Storage abstraction** | Local filesystem | Interface for future Supabase | 2 days |

---

## Enhancement Plan

### Phase 0: Foundation Alignment (1 week)

#### Goal
Rename, rebrand, and prepare architectural abstractions.

#### Tasks

1. **Branding Update**
   - Rename "OpsFlow" → "XpenseFlow AI"
   - Rename "financial-ops-platform" → "xpenseflow-ai"
   - Update all brand strings, titles, descriptions
   - Update package names: `packages.core` → `packages.core` (keep)
   - Update env vars: `OPSFLOW_*` → `XPENSEFLOW_*`

2. **Add User.locale and Tenant.lolaNickname**
   - Migration: add `locale` column to users (default 'es')
   - Migration: add `lola_nickname` column to companies (default 'Lola')

3. **Auth Abstraction Layer**
   - Create `packages/core/platform/auth/interface.py` with `AuthService` interface
   - Extract magic-link auth to `MagicLinkAuthService`
   - Prepare interface for future `ClerkAuthService`

4. **Storage Abstraction Layer**
   - Create `packages/core/platform/storage/interface.py` with `StorageService`
   - Extract local storage to `LocalStorageService`
   - Prepare interface for future `SupabaseStorageService`

5. **Environment Validation**
   - Add `OLLAMA_BASE_URL` as primary LLM config
   - Add `AGENT_SECRET` for agent-to-agent communication
   - Update `.env.example`

---

### Phase 1: Lola Agent Orchestrator (3 weeks)

#### Goal
Build the persistent tenant orchestrator agent that coordinates all add-on agents.

#### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Lola (Tenant Agent)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Memory    │  │   Tools     │  │   Orchestrator     │  │
│  │  (pgvector) │  │  Registry   │  │   (LangGraph)      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
    ┌─────────────┐    ┌─────────────────┐   ┌─────────────────┐
    │  Context    │    │  Agent Bus     │   │  Add-on Agents  │
    │  (Redis)    │    │  (Redis pub/sub)│   │  (per-module)  │
    └─────────────┘    └─────────────────┘   └─────────────────┘
```

#### Tasks

1. **Lola Models**
   ```python
   # packages/core/platform/models_lola.py
   
   class LolaSession(Base):
       """One persistent Lola per tenant"""
       __tablename__ = "lola_sessions"
       id: Mapped[int] = mapped_column(primary_key=True)
       company_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
       nickname: Mapped[str] = mapped_column(String(50), default="Lola")
       created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
       
   class LolaMemory(Base):
       """Long-term memory vectors"""
       __tablename__ = "lola_memory"
       id: Mapped[int] = mapped_column(primary_key=True)
       company_id: Mapped[int] = mapped_column(Integer, index=True)
       content: Mapped[str] = mapped_column(Text)
       embedding: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # pgvector
       created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
   ```

2. **Lola Service**
   ```python
   # packages/modules/lola/service/lola_service.py
   
   class LolaService:
       """Orchestrator that coordinates all add-on agents"""
       
       async def process(self, company_id: int, user_id: int, message: str) -> AsyncGenerator[str, None]:
           """Process user message, route to appropriate agent, stream response"""
           
       async def remember(self, company_id: int, content: str) -> None:
           """Store in pgvector for context"""
           
       async def recall(self, company_id: int, query: str, k: int = 5) -> list[str]:
           """Semantic search through memory"""
   ```

3. **Agent Bus (Redis pub/sub)**
   ```python
   # packages/core/agent_bus.py
   
   class AgentBus:
       """Redis pub/sub for inter-agent communication"""
       
       async def publish(self, channel: str, message: AgentMessage) -> None:
           """Publish message to channel"""
           
       async def subscribe(self, channel: str, handler: Callable[[AgentMessage], None]) -> None:
           """Subscribe to channel with handler"""
   ```

4. **Agent Guardrails**
   ```python
   # packages/core/agent_guardrails.py
   
   BLOCKED_ACTIONS = [
       "delete_any_record",
       "bypass_approval_step",
       "modify_audit_log",
       "access_other_tenant_data",
       "execute_payment",
       "modify_user_permissions_without_admin",
       "send_external_communication_without_approval",
   ]
   
   REQUIRES_CONFIRMATION = [
       "apply_tenant_config_change",
       "install_addon",
       "create_workflow_rule",
       "bulk_export",
   ]
   ```

5. **Lola API Router**
   ```python
   # packages/modules/lola/api/router.py
   
   router = APIRouter(prefix="/api/lola", tags=["lola"])
   
   @router.post("/chat")
   async def chat(message: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
       """Stream chat response from Lola"""
       
   @router.get("/memory")
   async def get_memories(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
       """Get all stored memories for tenant"""
   ```

6. **Lola UI Component**
   ```tsx
   // web/components/lola/LolaPanel.tsx
   
   export function LolaPanel() {
     // Slide-in panel from right
     // Persistent across navigation
     // Chat interface with streaming
     // Action buttons for quick actions
   }
   ```

---

### Phase 2: Workflow Engine Upgrade (2 weeks)

#### Goal
Upgrade from stage-based to step-based workflow engine with agent tasks.

#### Current vs Required

| Current | Required |
|---------|----------|
| `WorkflowStage` (name, order) | `WorkflowStep` (type, name, order, config) |
| `WorkflowTransition` (from_stage, to_stage) | Built-in step progression |
| No agent tasks | `AGENT_TASK` step type |
| No validation steps | `VALIDATION` step type |
| No output steps | `OUTPUT` step type |

#### Tasks

1. **New Workflow Models**
   ```python
   # packages/core/platform/models_workflow_v2.py
   
   class StepType(enum.Enum):
       VALIDATION = "validation"
       AGENT_TASK = "agent_task"
       APPROVAL = "approval"
       NOTIFICATION = "notification"
       OUTPUT = "output"
   
   class WorkflowStep(Base):
       __tablename__ = "workflow_steps"
       id: Mapped[int] = mapped_column(primary_key=True)
       workflow_id: Mapped[int] = mapped_column(ForeignKey("workflows.id"))
       step_type: Mapped[StepType]
       name: Mapped[str]
       order: Mapped[int]
       config: Mapped[dict] = mapped_column(JSON)  # step-specific config
       
   class Workflow(Base):
       __tablename__ = "workflows"
       id: Mapped[int] = mapped_column(primary_key=True)
       company_id: Mapped[int] = mapped_column(Integer, index=True)
       module_key: Mapped[str]  # which add-on owns this workflow
       name: Mapped[str]
       description: Mapped[str | None]
       is_active: Mapped[bool] = mapped_column(Boolean, default=True)
       steps: Mapped[list[WorkflowStep]] = relationship(...)
   ```

2. **Workflow Execution Engine**
   ```python
   # packages/core/workflow/executor.py
   
   class WorkflowExecutor:
       async def execute_step(self, step: WorkflowStep, item: WorkflowItem) -> StepResult:
           match step.step_type:
               case StepType.VALIDATION:
                   return await self.run_validation(step, item)
               case StepType.AGENT_TASK:
                   return await self.run_agent_task(step, item)
               case StepType.APPROVAL:
                   return await self.run_approval(step, item)
               # ...
   ```

3. **Workflow Canvas UI**
   ```tsx
   // web/components/workflow/WorkflowCanvas.tsx
   // React Flow-based visual builder
   // Drag-and-drop step types
   // Configure step properties
   // Preview workflow
   ```

---

### Phase 3: Add-on Marketplace (2 weeks)

#### Goal
Transform modules into installable add-ons with capability manifests.

#### Tasks

1. **Add-on Manifest**
   ```yaml
   # packages/modules/expenses/addon.yaml
   name: expenses
   version: 1.0.0
   displayName: Expense Reports
   description: CFDI expense management with SAT validation
   category: finance
   
   capabilities:
     - workflow
     - storage
     - notifications
   
   permissions:
     - read:expenses
     - write:expenses
     - approve:expenses
   
   dependencies:
     - core >= 1.0.0
   
   workflows:
     - expenses:approval
   
   agents:
     - expenses:validator
     - expenses:categorizer
   ```

2. **Add-on Registry Service**
   ```python
   # packages/core/addons/registry.py
   
   class AddonRegistry:
       def list_available(self) -> list[AddonManifest]:
           """List all add-ons available for installation"""
           
       def install(self, company_id: int, addon_key: str) -> InstalledAddon:
           """Install add-on for tenant"""
           
       def uninstall(self, company_id: int, addon_key: str) -> None:
           """Uninstall add-on for tenant"""
   ```

3. **Marketplace UI**
   ```tsx
   // web/app/admin/marketplace/page.tsx
   // Browse available add-ons
   // View details, capabilities, permissions
   // Install/uninstall
   // Configure add-on settings
   ```

---

### Phase 4: Notifications System (1 week)

#### Goal
Add in-app notification bell with rules builder.

#### Tasks

1. **Notification Models**
   ```python
   # packages/core/platform/models_notification.py
   
   class Notification(Base):
       __tablename__ = "notifications"
       id: Mapped[int] = mapped_column(primary_key=True)
       company_id: Mapped[int] = mapped_column(Integer, index=True)
       user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
       title: Mapped[str]
       body: Mapped[str]
       read_at: Mapped[datetime | None]
       created_at: Mapped[datetime]
       
   class NotificationRule(Base):
       __tablename__ = "notification_rules"
       id: Mapped[int] = mapped_column(primary_key=True)
       company_id: Mapped[int] = mapped_column(Integer, index=True)
       trigger: Mapped[str]  # e.g., "expense.approved"
       channels: Mapped[list[str]] = mapped_column(JSON)  # ["in_app", "email", "whatsapp"]
       conditions: Mapped[dict | None] = mapped_column(JSON)  # e.g., {"amount": {">": 10000}}
   ```

2. **SSE Endpoint for Real-time**
   ```python
   @router.get("/notifications/stream")
   async def notification_stream(user: User = Depends(get_current_user)):
       """Server-sent events for real-time notifications"""
       async def event_generator():
           while True:
               # Check for new notifications
               yield f"data: {json.dumps(notification)}\n\n"
       return StreamingResponse(event_generator(), media_type="text/event-stream")
   ```

3. **Notification Bell UI**
   ```tsx
   // web/components/notifications/NotificationBell.tsx
   // Bell icon with unread count
   // Dropdown with notification list
   // Mark as read, clear all
   ```

---

### Phase 5: Agent Memory Integration (1 week)

#### Goal
Integrate pgvector for Lola's context memory.

#### Tasks

1. **Memory Embedding Service**
   ```python
   # packages/modules/lola/service/memory_service.py
   
   class MemoryService:
       async def store(self, company_id: int, content: str) -> int:
           """Embed content and store in pgvector"""
           embedding = await self.embed(content)
           # Store with embedding
           
       async def search(self, company_id: int, query: str, k: int = 5) -> list[Memory]:
           """Semantic search through memories"""
           query_embedding = await self.embed(query)
           # pgvector similarity search
   ```

2. **Context Window Management**
   ```python
   class LolaContext:
       """Manage context window for Lola conversations"""
       
       def build_context(self, company_id: int, current_message: str) -> str:
           """Build context including:
           - Company info
           - User info  
           - Recent memories (pgvector search)
           - Current workflow state
           - Pending approvals
           """
   ```

---

## Migration Strategy

### Approach: Feature Flags + Gradual Rollout

1. **Phase 0** — Low risk, branding updates
2. **Phase 1 (Lola)** — Add new module, no breaking changes
3. **Phase 2 (Workflow)** — New tables alongside existing, migration script
4. **Phase 3 (Add-ons)** — New system, existing modules remain functional
5. **Phase 4 (Notifications)** — Add tables, new UI
6. **Phase 5 (Memory)** — Extend existing pgvector setup

### Rollback Plan

Each phase is independently deployable. If issues arise:
- Phase 0: Revert brand strings
- Phase 1: Disable Lola module, remove routes
- Phase 2: Keep using WorkflowStage/WorkflowTransition
- Phase 3: Keep modules as-is, skip marketplace
- Phase 4: Notifications are additive, safe to disable
- Phase 5: Memory is optional enhancement

---

## Testing Strategy

### Unit Tests
- All new services have pytest tests
- Mock external dependencies (Redis, Ollama)
- Cover guardrail enforcement

### Integration Tests
- Test workflow execution end-to-end
- Test agent bus pub/sub
- Test notification delivery

### E2E Tests
- Lola chat flow
- Workflow creation and execution
- Add-on installation

---

## Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| 0. Foundation | 1 week | None |
| 1. Lola Agent | 3 weeks | Phase 0 |
| 2. Workflow Engine | 2 weeks | Phase 1 |
| 3. Add-on Marketplace | 2 weeks | Phase 2 |
| 4. Notifications | 1 week | None |
| 5. Agent Memory | 1 week | Phase 1 |

**Total: ~10 weeks**

---

## Files to Create/Modify

### New Files (Estimate)
- `packages/modules/lola/` — ~50 files
- `packages/core/workflow/` — ~15 files
- `packages/core/addons/` — ~10 files
- `web/components/lola/` — ~8 files
- `web/components/workflow/` — ~12 files
- `web/components/notifications/` — ~5 files

### Modified Files (Estimate)
- `apps/api/main.py` — add new routers
- `packages/core/platform/models_*.py` — add new models
- `web/app/layout.tsx` — add LolaPanel
- `web/app/admin/` — add marketplace page
- Migrations — ~10 new migration files

---

## Success Criteria

1. ✅ Lola can chat, remember, and coordinate add-on agents
2. ✅ Workflows support all step types (VALIDATION, AGENT_TASK, APPROVAL, NOTIFICATION, OUTPUT)
3. ✅ Add-ons can be installed/uninstalled per tenant
4. ✅ Notifications appear in-app with configurable rules
5. ✅ Agent memory uses pgvector for semantic search
6. ✅ All existing features continue to work
7. ✅ All tests pass
8. ✅ No breaking changes for existing users