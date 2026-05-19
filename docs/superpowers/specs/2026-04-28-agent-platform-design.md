# Agent Platform Design
**Date:** 2026-04-28  
**Status:** Approved — pending implementation plan

---

## 1. Problem Statement

The Financial Ops platform has a functional single-engine AI agent (Ollama + `run_turn()`) with hardcoded personas and keyword-based routing. It needs to evolve into a true multi-agent system where:

- Each domain (config, expense, accounting, etc.) is a **first-class named agent** with its own system prompt, tool allowlist, and LLM config.
- Channel events (WhatsApp messages, inbound emails) are handled **autonomously** by dedicated channel agents, with escalation to human review for high-stakes actions.
- A **Super Admin portal** provides full lifecycle management: create agents, edit their skills, configure LLM providers per tenant, monitor live activity.
- The LLM provider is **pluggable** — Ollama remains the default but Anthropic/OpenAI can be activated per tenant via the Super Admin UI.

---

## 2. Guiding Principles

- **Don't replace what works.** `run_turn()`, the tool registry, audit log, `AgentPendingAction`, and `AgentSession` are solid. They become the executor layer that all agents call.
- **Data-driven, not code-driven.** Adding a new agent = inserting a DB row + (optionally) registering new tools in code. No router changes needed.
- **Security by default.** API keys are stored as env var references, never raw in DB. Tool allowlists are validated against the live code registry — you can't enable a tool that doesn't exist in code.
- **Escalate, don't guess.** Channel agents apply an autonomous threshold. Low-confidence or high-stakes actions surface to the admin portal before committing.
- **YAGNI on infrastructure.** No message bus, no Redis, no separate worker processes — FastAPI background tasks + PostgreSQL are sufficient for current scale.

---

## 3. Architecture

```
Inbound request (chat UI / WhatsApp webhook / email webhook)
          │
          ▼
  ┌───────────────────┐
  │   Orchestrator    │   LLM call #1 — lightweight router
  │   (agent key:     │   System prompt reads live agent_definitions.
  │    orchestrator)  │   Output JSON: { agent_key, confidence }
  └────────┬──────────┘
           │ dispatches to named agent
     ┌─────┼──────┬─────────────┬───────────────┐
     ▼     ▼      ▼             ▼               ▼
  config expense accounting compliance  integration
  Agent  Agent   Agent     Agent         Agent
                                              ▲
                           whatsapp    email
                            Agent      Agent
                         (background) (background)
```

**Chat flow (existing chat UI):**
1. `POST /agent/chat/{cid}` → orchestrator routing call → selected agent `run_turn()` → response streamed to UI.

**Channel flow (WhatsApp / email):**
1. Webhook receives event → FastAPI `BackgroundTask` → `ChannelAgentDispatcher.dispatch()`.
2. Dispatcher loads `AgentDefinition` + `ChannelAgentConfig` for the channel.
3. Runs `run_turn()` with channel agent's prompt + tools.
4. Evaluates: confidence < threshold OR high-stakes rule triggered → creates `AgentPendingAction` for human review. Otherwise commits.
5. Sends channel acknowledgment (WhatsApp reply / email acknowledgment).

---

## 4. Database Schema

### 4.1 `agent_definitions`

One row per agent type. System agents (`is_system=true`) are seeded at boot and cannot be deleted.

```sql
id              SERIAL PRIMARY KEY
key             VARCHAR(64) UNIQUE NOT NULL        -- slug: expense, whatsapp, etc.
name            VARCHAR(128) NOT NULL
description     TEXT
system_prompt   TEXT NOT NULL
allowed_tools   JSONB NOT NULL DEFAULT '[]'        -- ["create_expense", ...]
persona         VARCHAR(32) NOT NULL DEFAULT 'admin'  -- maps to Persona type
is_system       BOOLEAN NOT NULL DEFAULT FALSE
is_active       BOOLEAN NOT NULL DEFAULT TRUE
created_at      TIMESTAMP NOT NULL DEFAULT now()
updated_at      TIMESTAMP NOT NULL DEFAULT now()
```

**Validation rule:** `allowed_tools` entries are validated against the live `REGISTRY` on save. Unknown tool names are rejected with a 422.

### 4.2 `channel_agent_configs`

One row per channel agent. Controls autonomous vs. escalation behavior.

```sql
id                    SERIAL PRIMARY KEY
agent_id              INTEGER REFERENCES agent_definitions(id) ON DELETE CASCADE
channel_type          VARCHAR(32) NOT NULL                  -- whatsapp | email
autonomous_threshold  FLOAT NOT NULL DEFAULT 0.80           -- 0.0–1.0
high_stakes_rules     JSONB NOT NULL DEFAULT '[]'
-- rule shape: [{"field": "amount", "op": "gt", "value": 5000}]
-- supported ops: gt, lt, eq, contains
test_mode             BOOLEAN NOT NULL DEFAULT FALSE        -- log only, no real actions
created_at            TIMESTAMP NOT NULL DEFAULT now()
updated_at            TIMESTAMP NOT NULL DEFAULT now()
```

### 4.3 `llm_provider_configs`

Per-tenant (or global if `company_id IS NULL`) LLM provider config. Company row overrides global.

```sql
id              SERIAL PRIMARY KEY
company_id      INTEGER REFERENCES companies(id) ON DELETE CASCADE NULLABLE
provider        VARCHAR(32) NOT NULL DEFAULT 'ollama'   -- ollama | anthropic | openai
base_url        VARCHAR(512)                            -- required for ollama / self-hosted
api_key_env_ref VARCHAR(128)                            -- env var name, e.g. ANTHROPIC_API_KEY
model_name      VARCHAR(128) NOT NULL
is_active       BOOLEAN NOT NULL DEFAULT TRUE
created_at      TIMESTAMP NOT NULL DEFAULT now()
updated_at      TIMESTAMP NOT NULL DEFAULT now()
UNIQUE (company_id)  -- one config per tenant (NULL = global)
```

**Security:** API keys are NEVER stored as raw values. `api_key_env_ref` stores the environment variable name. The `LLMProviderService` reads `os.environ[api_key_env_ref]` at call time.

---

## 5. Backend Services

### 5.1 `AgentDefinitionService`
`packages/modules/agent/core/agent_definition_service.py`

- `get_all(db) → list[AgentDefinition]` — all active definitions
- `get_by_key(db, key) → AgentDefinition` — single lookup
- `upsert(db, data) → AgentDefinition` — create or update; validates tools against registry
- `seed_defaults(db)` — idempotent; only inserts if `agent_definitions` table is empty

In-process TTL cache (60 seconds) so the DB isn't hit on every agent turn.

### 5.2 `LLMProviderService`
`packages/modules/agent/core/llm_provider_service.py`

- `resolve(db, company_id) → LLMProvider` — company config → global config → `.env` defaults
- `build_client(provider) → OllamaClient | AnthropicClient | OpenAIClient`
- `test_connection(provider_config) → dict` — pings the provider, returns `{ok, latency_ms, models}`

Provider clients implement a common interface so `run_turn()` can call either without branching. For now only Ollama is implemented; Anthropic/OpenAI stubs are ready but raise `NotImplementedError` until activated.

### 5.3 `ChannelAgentDispatcher`
`packages/modules/agent/core/channel_dispatcher.py`

Replaces the deleted `packages/modules/channels/service/agent.py` and `packages/modules/requests/agent.py`.

```python
async def dispatch(
    db, channel_type: str, payload: dict, company_id: int
) -> DispatchResult:
    config = load_channel_config(db, channel_type)
    agent_def = get_by_key(db, config.agent_key)
    result = run_turn(db=db, agent_definition=agent_def, ...)
    
    if config.test_mode:
        log_only(result)
        return DispatchResult(escalated=False, test_mode=True)
    
    if should_escalate(result, config):
        create_pending_action(db, result, reason="below_threshold")
        return DispatchResult(escalated=True)
    
    commit_actions(db, result)
    return DispatchResult(escalated=False)
```

`should_escalate()` checks: confidence < threshold OR any high-stakes rule matches the result payload.

### 5.4 Orchestrator (real routing)
`packages/modules/agent/core/orchestrator.py` — replaces keyword-matching stub.

Makes a real LLM call using the `orchestrator` agent definition's system prompt. The system prompt includes a live-rendered list of available active agents and their descriptions. Returns `{agent_key, confidence}`. Falls back to `config` agent on JSON parse failure. No tools — routing call only, kept fast.

---

## 6. API Endpoints (Super Admin)

All new endpoints under `/super-admin`, guarded by `require_super_admin`.

### Agent Definitions
```
GET    /super-admin/agent-definitions              list all
POST   /super-admin/agent-definitions              create
GET    /super-admin/agent-definitions/{key}        get one
PUT    /super-admin/agent-definitions/{key}        update prompt / tools / active
DELETE /super-admin/agent-definitions/{key}        delete (blocked if is_system=true)
```

### Channel Agent Config
```
GET    /super-admin/channel-agent-configs          list all
PUT    /super-admin/channel-agent-configs/{agent_key}  update threshold / rules / test_mode
```

### LLM Provider Config
```
GET    /super-admin/llm-configs                    list (global + per-tenant)
POST   /super-admin/llm-configs                    create / upsert
PUT    /super-admin/llm-configs/{id}               update
DELETE /super-admin/llm-configs/{id}               delete (reverts to global)
POST   /super-admin/llm-configs/test               test connection → {ok, latency_ms, models}
```

### Tool Registry (read-only)
```
GET    /super-admin/tool-registry                  list all registered tools with description
```
Used by the Agent Builder UI to populate the tool checklist.

---

## 7. Frontend — Super Admin Pages

### 7.1 `/super-admin/agents` — Agent Builder (new page)

**Layout:** Two-panel. Left: agent list with status dot (active/inactive), persona badge, channel badge if applicable. Right: detail panel for selected agent.

**Detail panel tabs:**
- **Identity** — name, description, persona selector, active toggle
- **System Prompt** — large textarea (monospaced), character count
- **Tools** — checklist of all registered tools grouped by domain (read from `/super-admin/tool-registry`). Checkboxes enable/disable. Unknown tools shown in red.
- **Channel Config** (tab visible only for channel agents) — autonomous threshold slider, high-stakes rules builder (field / operator / value rows), test mode toggle

**Actions:** Save, Clone, Delete (blocked for system agents with tooltip explanation).

**"New Agent" button** → modal with: name, description, persona, template picker (blank or clone from existing). Creates the row, lands on detail panel.

### 7.2 `/super-admin/llm-config` — LLM Configuration (new page)

**Three provider cards** (Ollama · Anthropic · OpenAI):
- Active provider card has indigo border
- Each card: provider logo, model name, status badge, "Configure" button
- Configure panel: base URL (Ollama), model name, env var name for API key, "Test Connection" button → inline result

**Per-tenant overrides table** below the global section:
- Company name, provider, model, status
- "Add override" opens a form identical to global configure panel but with company selector

### 7.3 `/super-admin/agent-management` (existing, enhanced)

Adds a **per-agent breakdown** panel: click any team card → right panel shows:
- System prompt preview (first 200 chars, expandable)
- Recent tool calls (last 10) with latency
- Error rate last 24h
- Link to edit → `/super-admin/agents/{key}`

Request feed upgraded: each row shows which agent handled it (not just "team").

### 7.4 `/super-admin/page.tsx` (updated landing)

New group **"Agent Management"** with tiles:
- Agent Builder → `/super-admin/agents`
- LLM Configuration → `/super-admin/llm-config`

Existing groups preserved.

---

## 8. Agent Roster (7 seeded defaults)

| key | name | persona | channel | is_system |
|---|---|---|---|---|
| `orchestrator` | Orchestrator | admin | — | true |
| `config` | Configuration Agent | admin | — | true |
| `expense` | Expense Agent | employee | — | true |
| `accounting` | Accounting Agent | admin | — | true |
| `compliance` | Compliance Agent | admin | — | true |
| `whatsapp` | WhatsApp Agent | employee | whatsapp | true |
| `email` | Email Agent | employee | email | true |

Seeded inactive (available to enable): `integration`, `purchase_requests`.

---

## 9. What Becomes an Agent — Decision Log

| Subsystem | Agent? | Rationale |
|---|---|---|
| WhatsApp inbound | **Yes** | Needs AI judgment: classify message, create expense or escalate |
| Email inbound | **Yes** | Same: parse attachments, extract expense data, route |
| Purchase requests | **Yes (inactive)** | State machine exists; agent handles intake + AI-assisted routing |
| CFDI pairing | **No** | Deterministic XML matching — no LLM adds value |
| Expense approval routing | **No** | `WorkflowTransition` rules engine is correct for this |
| Accounting export / Poliza | **No** | Batch job, no natural language input |
| Anomaly detection | **No (yet)** | Current statistical approach works; revisit when explanations are needed |
| Duplicate detection | **No** | Deterministic similarity scoring |

---

## 10. Error Handling

- **Orchestrator routing failure** (JSON parse error, network) → falls back to `config` agent with a note in the response.
- **Agent `run_turn()` failure** → existing error path in `run_turn()` returns `{ok: false, error: ...}`. Channel dispatcher creates a `AgentPendingAction` with `reason: "agent_error"`.
- **LLM provider unavailable** → `LLMProviderService.resolve()` catches connection errors and returns a structured error. Chat endpoint returns 503 with a user-facing message. Channel dispatcher creates pending action.
- **Tool allowlist violation** → if the LLM tries to call a tool not in `allowed_tools`, the executor silently skips it and logs a warning. The agent continues with remaining tools.
- **High-stakes escalation** → `AgentPendingAction` row created. Existing admin portal surfaces pending actions for review. Channel sends acknowledgment: "Your request is being reviewed by a team member."

---

## 11. Testing

New test files (SQLite in-memory, matching existing pattern):

| file | covers |
|---|---|
| `tests/test_agent_definitions.py` | CRUD, tool validation, seed idempotency, system agent deletion blocked |
| `tests/test_llm_provider_service.py` | fallback chain (company → global → .env), env var resolution, test_mode |
| `tests/test_channel_dispatcher.py` | autonomous commit path, escalation path, high-stakes rule matching, test mode |
| `tests/test_orchestrator_routing.py` | routing call output parsing, fallback on bad JSON |

Existing `tests/agent_evals/` are untouched. Existing `tests/test_agent_engine.py` gets one new case: `run_turn()` with an `agent_definition` kwarg respects `allowed_tools`.

---

## 12. Out of Scope (this iteration)

- Real-time agent status via WebSocket (polling is fine for now)
- Per-tenant agent enable/disable (agents are global; tenants are isolated by company_id on data)
- Anthropic / OpenAI client implementations (stubs ready, `NotImplementedError` until needed)
- Agent-to-agent delegation (orchestrator dispatches to one agent per turn)
- Streaming responses for channel agents (fire-and-forget is correct for async channels)
