# Admin Assistant Agent Architecture

## Overview

A family of specialized AI agents that guide users through configuration, manage backoffice operations, and execute financial workflows. Agents are strictly isolated by tenant with platform-level infrastructure managed separately.

## Architecture Principles

1. **Configuration agents** guide setup; **Execution agents** perform work
2. **Platform level** manages infrastructure; **Tenant level** serves customers
3. **Strict tenant isolation** — no cross-tenant data, memory, or access
4. **Conversational, not form-filling** — agents are colleagues, not wizards
5. **Proactive logic chains** — if-then reasoning guides configuration

---

## Agent Personas

### Platform Level (Super Admin)

**Super Admin Agent** — `/super-admin`
- Manages all tenants (create, suspend, configure)
- Defines agent definitions available to tenants
- Configures LLM providers (OpenAI, Anthropic, Ollama, etc.)
- Monitors usage, costs, and rate limits
- Handles platform-wide announcements
- Cannot access tenant data directly

### Tenant Level — Configuration

**Admin Config Agent** — `/mywork?module=admin`
- Guides company setup (legal entities, cost centers, clients)
- Configures users, roles, and permissions
- Sets up expense policies and approval workflows
- Manages integrations (SAT, email, WhatsApp)
- Proactive: "If you enable approvals, you need managers"
- Learns company context, never shares across tenants

**Accounting Config Agent** — `/mywork?module=admin` (accounting section)
- Configures accounting catalogs (accounts, dimensions)
- Sets up category mapping rules
- Defines export formats (Poliza, Excel, etc.)
- Manages fiscal period closing
- Proactive: "If you use cost centers, map them to accounts"

### Tenant Level — Execution

**Accountant Work Agent** — `/mywork?module=accounting`
- Categorizes expenses using learned patterns
- Matches CFDI to expenses automatically
- Generates Poliza vouchers
- Flags anomalies for human review
- Remembers corrections to improve accuracy

**Employee Agent** — `/mywork` (all other modules)
- Helps create expenses (photo, WhatsApp, form)
- Checks policy limits before submission
- Tracks approval status
- Answers questions about reimbursements

---

## Database Schema

### Platform Tables (super admin only)

```sql
-- Tenants (companies using the platform)
CREATE TABLE platform_tenants (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    plan VARCHAR(32) NOT NULL DEFAULT 'starter',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settings JSONB NOT NULL DEFAULT '{}'
);

-- LLM providers (OpenAI, Anthropic, local Ollama)
CREATE TABLE platform_llm_providers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(64) UNIQUE NOT NULL,
    provider_type VARCHAR(32) NOT NULL, -- 'openai', 'anthropic', 'ollama'
    api_key_encrypted TEXT,
    base_url VARCHAR(255),
    model_name VARCHAR(128) NOT NULL,
    cost_per_1k_tokens_input DECIMAL(10,6),
    cost_per_1k_tokens_output DECIMAL(10,6),
    rate_limit_rpm INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agent definitions (templates available to tenants)
CREATE TABLE platform_agent_definitions (
    id SERIAL PRIMARY KEY,
    key VARCHAR(64) UNIQUE NOT NULL, -- 'admin-config', 'accountant-work', etc.
    name VARCHAR(128) NOT NULL,
    description TEXT,
    system_prompt TEXT NOT NULL,
    allowed_tools JSONB NOT NULL DEFAULT '[]',
    default_provider_id INTEGER REFERENCES platform_llm_providers(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Usage logging (billing and analytics)
CREATE TABLE platform_usage_logs (
    id BIGSERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES platform_tenants(id),
    agent_key VARCHAR(64) NOT NULL,
    provider_id INTEGER REFERENCES platform_llm_providers(id),
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_input DECIMAL(10,6),
    cost_output DECIMAL(10,6),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_usage_logs_tenant_created ON platform_usage_logs(tenant_id, created_at DESC);
```

### Tenant Tables (company-scoped)

```sql
-- Agent sessions (conversation threads)
CREATE TABLE tenant_agent_sessions (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL,
    agent_key VARCHAR(64) NOT NULL,
    user_id INTEGER NOT NULL,
    session_id VARCHAR(128) NOT NULL, -- unique per conversation
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(company_id, session_id)
);
CREATE INDEX idx_agent_sessions_company ON tenant_agent_sessions(company_id);

-- Agent memory (learned preferences, corrections)
CREATE TABLE tenant_agent_memory (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL,
    agent_key VARCHAR(64) NOT NULL,
    key VARCHAR(128) NOT NULL, -- 'preferred_account_for_office_supplies'
    value TEXT NOT NULL,
    confidence DECIMAL(3,2) DEFAULT 1.0,
    learned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    UNIQUE(company_id, agent_key, key)
);
CREATE INDEX idx_agent_memory_company_agent ON tenant_agent_memory(company_id, agent_key);

-- Workflow progress (state machine tracking)
CREATE TABLE tenant_workflow_progress (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL,
    workflow_key VARCHAR(64) NOT NULL, -- 'onboarding', 'month_end_close'
    current_step INTEGER NOT NULL DEFAULT 0,
    total_steps INTEGER NOT NULL,
    completed_steps JSONB NOT NULL DEFAULT '[]',
    context JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, workflow_key)
);
```

---

## Backend Structure

```
packages/modules/agent/
├── core/
│   ├── engine.py           # Main agent execution engine
│   ├── orchestrator.py     # Routes messages to appropriate agent
│   ├── registry.py         # Tool registry (existing)
│   ├── memory.py           # Tenant-scoped memory service
│   ├── workflow.py         # State machine for guided flows
│   └── providers.py        # LLM provider abstraction
├── agents/
│   ├── super_admin.py      # Platform management agent
│   ├── admin_config.py     # Company setup, users, policies
│   ├── accounting_config.py # Catalogs, mappings, exports
│   ├── accountant_work.py  # Categorization, matching, Poliza
│   └── employee.py         # Expense creation, status
├── tools/
│   ├── platform/           # Super admin tools
│   │   ├── tenant_tools.py
│   │   ├── provider_tools.py
│   │   └── usage_tools.py
│   ├── admin/              # Admin config tools (existing)
│   │   ├── company_tools.py
│   │   ├── user_tools.py
│   │   ├── policy_tools.py
│   │   └── workflow_tools.py
│   ├── accounting/         # Accounting config tools
│   │   ├── catalog_tools.py
│   │   ├── mapping_tools.py
│   │   └── export_tools.py
│   └── work/               # Execution tools
│       ├── expense_tools.py
│       ├── categorization_tools.py
│       └── poliza_tools.py
└── api/
    ├── platform_router.py  # /api/platform/* (super admin)
    └── tenant_router.py    # /api/agent/* (tenant agents)
```

---

## Frontend Structure

```
web/components/agent/
├── AgentOrchestrator.tsx   # Top-level context provider
├── AgentRail.tsx           # Collapsible sidebar (always visible)
├── AgentWorkspace.tsx      # Full-screen workspace for complex tasks
├── AgentMessage.tsx        # Message bubble with actions
├── AgentInput.tsx          # Text input with suggestions
├── AgentStatus.tsx         # Typing indicator, progress
└── agents/
    ├── SuperAdminAgent.tsx # Platform management UI
    ├── AdminConfigAgent.tsx
    ├── AccountingConfigAgent.tsx
    ├── AccountantWorkAgent.tsx
    └── EmployeeAgent.tsx

web/context/
└── AgentContext.tsx        # Session, memory, workflow state

web/hooks/
└── useAgent.ts             # Chat, actions, progress
```

### UI Behavior

**Rail (default)**
- Fixed 48px collapsed, expands to 320px on hover/click
- Shows: agent avatar, recent messages, quick actions
- Always visible in `/mywork` and `/super-admin`

**Workspace (expanded)**
- Full-screen overlay for complex tasks
- Triggered by: onboarding flows, accounting setup, bulk operations
- Shows: full conversation history, rich actions, progress indicators
- Escape key returns to rail

---

## API Routes

### Platform Level (`/api/platform/*`)

```
POST /api/platform/tenants              # Create tenant
GET  /api/platform/tenants              # List all tenants
PATCH /api/platform/tenants/:id          # Update tenant
DELETE /api/platform/tenants/:id         # Suspend tenant

POST /api/platform/providers             # Add LLM provider
GET  /api/platform/providers             # List providers
PATCH /api/platform/providers/:id        # Update provider

GET  /api/platform/definitions            # List agent definitions
POST /api/platform/definitions            # Create definition

GET  /api/platform/usage                  # Usage analytics
GET  /api/platform/usage/export           # CSV export

POST /api/platform/chat                   # Super admin agent chat
```

### Tenant Level (`/api/agent/*`)

```
POST /api/agent/chat/:company_id          # Chat with agent (auto-routes by persona)
GET  /api/agent/sessions/:company_id       # List user's sessions
GET  /api/agent/memory/:company_id         # Get learned preferences
DELETE /api/agent/memory/:company_id/:key  # Forget specific preference

POST /api/agent/workflow/:company_id/start  # Start guided workflow
GET  /api/agent/workflow/:company_id         # Get workflow progress
POST /api/agent/workflow/:company_id/advance # Advance to next step
```

---

## Tool Permissions

Each agent has a restricted tool set defined in `platform_agent_definitions.allowed_tools`:

| Agent | Tools |
|-------|-------|
| super_admin | `tenant_*`, `provider_*`, `usage_*`, `announcement_*` |
| admin_config | `company_*`, `user_*`, `policy_*`, `workflow_*`, `integration_*` |
| accounting_config | `catalog_*`, `mapping_*`, `export_*`, `period_*` |
| accountant_work | `expense_read`, `categorize_*`, `match_*`, `poliza_*` |
| employee | `expense_create`, `expense_read`, `policy_check`, `status_*` |

---

## Memory Design

### Tenant-Scoped Keys

Memory rows are isolated by `company_id` column with unique constraint on `(company_id, agent_key, key)`. The key field does NOT need a company_id prefix — the database enforces isolation:

```python
# Key is simple — company_id is a separate column
key = f"preferred_account_for_{category}"
value = "601-01-000"
memory.save(company_id=company_id, agent_key="accountant_work", key=key, value=value)

# Query automatically scopes by company_id
memory.get(company_id=company_id, agent_key="accountant_work", key=key)
```

### Memory Categories

1. **Preferences** — User-specified choices (e.g., default cost center)
2. **Learned patterns** — Corrections that improve accuracy (e.g., "Office Depot → office supplies account")
3. **Workflow context** — State for multi-step processes (e.g., onboarding progress)

### Retention

- Preferences: Permanent until explicitly changed
- Learned patterns: Decay confidence if contradicted, remove at 0.0
- Workflow context: Clear on completion or 30 days stale

---

## Workflow State Machine

### Example: Onboarding Workflow

```
Steps:
0. Welcome → Start
1. Company info (name, legal entities)
2. Users (invite admins, managers)
3. Policies (expense limits, approval thresholds)
4. Accounting (catalogs, cost centers)
5. Integrations (SAT, email)
6. Complete

State transitions:
- advance(step_id) → if valid, move to next
- skip(step_id) → if optional, mark complete
- rollback(step_id) → return to previous

Context stored:
{
  "company_name": "Acme Corp",
  "legal_entities": [{"name": "Acme Mexico SA de CV", "rfc": "ACM123456"}],
  "users_invited": [1, 2, 3],
  "policy_configured": true,
  "accounting_configured": false
}
```

---

## Proactive Logic

Agents reason about dependencies and prompt accordingly:

```python
# In admin_config agent
def check_dependencies(current_step, context):
    if current_step == "users" and not context.get("legal_entities"):
        return "Before adding users, we need at least one legal entity. Let's set that up."
    
    if current_step == "approvals" and not any(u.role == "manager" for u in context.users):
        return "You enabled approvals, but there are no managers to approve. Want to add one now?"
    
    return None  # No blockers
```

---

## Implementation Order

1. **Database migrations** — Platform tables, tenant tables
2. **Provider abstraction** — LLM provider service
3. **Memory service** — Tenant-scoped CRUD
4. **Workflow service** — State machine
5. **Agent definitions** — Insert personas into DB
6. **Tool registry** — Register all tools per agent
7. **Orchestrator** — Route messages to correct agent
8. **API routes** — Platform + tenant endpoints
9. **Frontend components** — Rail, workspace, context
10. **Testing** — Integration tests for each agent

---

## Security Constraints

1. **Tenant isolation**: All queries include `company_id` filter; no cross-tenant joins
2. **Tool restrictions**: Agents can only invoke tools in their `allowed_tools` list
3. **Memory scoping**: Keys include company_id; service validates ownership
4. **Rate limiting**: Per-tenant and per-user limits enforced at API layer
5. **Audit logging**: All agent actions logged with user, company, timestamp