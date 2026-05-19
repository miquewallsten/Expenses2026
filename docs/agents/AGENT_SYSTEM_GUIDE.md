# Financial Ops Agent System

## Architecture

The agent system is a **unified persona-based agent**, not a collection of independent agents. A single engine (`packages/modules/agent/core/engine.py`) powers all chat interactions. What changes between users is the **persona** (which determines available tools and system prompt) and optionally a **DB-driven agent definition** (which overrides both).

### Personas

| Persona | Who | Primary tools |
|---|---|---|
| `admin` | Company administrator | Full config, accounting, compliance, expense, diagnostic |
| `employee` | Regular staff | Create expenses, check status, knowledge search |
| `manager` | Team lead | Approve/reject expenses, list pending approvals |
| `finance_manager` | Finance team | Reports, month-end, reconciliation, accounting |
| `procurement` | Purchasing | Purchase requests (Phase 8) |

All personas share the same chat endpoint: `POST /agent/chat/{company_id}`.

### Agent Definitions (DB-driven overrides)

Stored in `agent_definitions` table and seeded via `AgentDefinitionService.seed_defaults()`. Each row overrides the persona default with:
- `system_prompt` — replaces the static prompt
- `allowed_tools` — JSON array of tool names; only these tools are exposed to the LLM
- `persona` — which persona this definition targets
- `is_system` — system rows cannot be deleted

Default definitions: `orchestrator`, `config`, `expense`, `accounting`, `compliance`, `whatsapp`, `email`.

### Orchestrator (lightweight routing)

When `use_orchestrator=True` is passed, the engine first runs the `orchestrator` agent definition. It classifies the user's intent into an `agent_key` and confidence score. If confidence is high enough, the engine re-runs the turn with the target agent definition. If low, it falls back to the original persona.

This is routing, not multi-agent coordination — a single agent handles each turn.

## Tool Registry

Tools live in `packages/modules/agent/tools/*.py` and self-register on import via `REGISTRY.register(ToolSpec(...))`.

Each tool declares:
- `personas` — which personas can invoke it (enforced in `dispatch()`)
- `required_permission` — optional fine-grained role gate (e.g. `agent.tool.rbac`)
- `destructive` — whether it changes state
- `requires_confirmation` — whether it produces a receipt for two-phase commit

Destructive tools with `requires_confirmation=True` return a `receipt_id`. The frontend shows a confirmation card; the user must POST `/agent/confirm` to apply the change. Appliers live in `packages/modules/agent/core/appliers.py`.

### Core Business Tools

| Tool | Description | Personas | Destructive |
|---|---|---|---|
| `create_expense` | Create a new expense draft | admin, employee | No |
| `check_reimbursement_status` | View expense/reimbursement status | all | No |
| `list_pending_approvals` | List expenses awaiting manager approval | admin, manager, finance_manager | No |
| `approve_expense` | Approve an expense (receipt → confirm) | admin, manager, finance_manager | Yes |
| `reject_expense` | Reject an expense (receipt → confirm) | admin, manager, finance_manager | Yes |
| `create_accounting_category` | Add an accounting category | admin | Yes |
| `bulk_create_accounting_categories` | Batch add categories | admin | Yes |
| `generate_poliza_preview` | Preview accounting voucher | admin, finance_manager | No |
| `run_month_end` | Month-end close summary | admin, finance_manager | No |
| `find_missing_receipts` | Find approved expenses without receipts | admin, finance_manager | No |
| `match_cfdis_batch` | Reconcile orphan CFDIs | admin, finance_manager | No |

### Config & Diagnostic Tools

| Tool | Description |
|---|---|
| `read_company_setup` | Read company settings |
| `update_company_setup` | Update company settings |
| `read_expense_policy` | Read expense policy |
| `update_expense_policy` | Update expense policy |
| `read_accounting_setup` | Read accounting config |
| `list_accounting_categories` | List chart of accounts |
| `check_tenant_readiness` | Validate all enabled modules |
| `explain_module_requirements` | Explain what a module needs |
| `suggest_next_configuration_step` | Recommend next config action |
| `diagnose_config` | Run full configuration diagnostic |
| `trace_workflow` | Trace workflow rules |

### Knowledge & Memory Tools

| Tool | Description |
|---|---|
| `how_to` | Static knowledge lookup (YAML) |
| `search_knowledge` | Hybrid search: vector similarity + static fallback |
| `get_knowledge` | Fetch knowledge by key |
| `remember` | Store a fact/preference for this company |
| `recall` | Retrieve stored facts |
| `list_memories` | List stored memories |
| `forget` | Delete a stored memory |

## Knowledge System

The agent uses **hybrid RAG**:
1. **Vector search** over `agent_knowledge_chunks` (pgvector, 1536-dim embeddings from OpenAI/Ollama)
2. **Static YAML fallback** from `packages/modules/agent/core/knowledge_static.yaml`

Knowledge chunks are scoped by `company_id` and `source_type`:
- `product_doc` — seeded from YAML at startup
- `config_history` — auto-generated when settings change
- `resolved_issue` — when a blocker is fixed

The `search_knowledge` tool is injected into the system prompt automatically when the user message matches relevant chunks.

## Chat Endpoints

### Non-streaming
```
POST /agent/chat/{company_id}
Body: { persona: "admin" | "employee" | ...,
        message: string,
        session_id?: string,
        hard_mode?: boolean }
Response: { session_id, content, tool_calls, pending, ok, error }
```

### Streaming (SSE)
```
GET /agent/stream/{company_id}?persona=...
SSE events: start → tool_call* → receipt_created* → final
```

### Confirmation
```
POST /agent/confirm
Body: { receipt_id: string }
```

## Frontend Integration

- **Chat panel**: `web/components/agent/AgentChatPanel.tsx`
- **Slash commands**: `web/components/agent/slashCommands.ts` — quick-palette for common operations
- **Receipt cards**: shown when a destructive tool returns a `receipt_id`
- **i18n keys**: under `agent.chat.slash.*` in `web/messages/es.json` and `en.json`

## Session Management

Sessions are stored in `agent_sessions` table with a `turns` JSON column. History is capped to `MAX_SESSION_TURNS = 40` to prevent context window overflow. Sessions are scoped by `(company_id, session_id)`.

## How to Add a New Tool

1. Create a Pydantic input schema (with `ConfigDict(extra="forbid")`)
2. Write a handler that takes `(AgentContext, validated_args) → ToolResult`
3. Register it:
```python
from packages.modules.agent.core.registry import REGISTRY, ToolSpec, ToolResult

REGISTRY.register(ToolSpec(
    name="my_tool",
    description="What it does",
    category="read",
    input_schema=MyToolInput,
    handler=_handle_my_tool,
    personas=frozenset({"admin", "employee"}),
))
```
4. If destructive, add an applier in `packages/modules/agent/core/appliers.py`
5. Add to relevant agent definition's `allowed_tools` if using DB-driven definitions
6. Add slash command and i18n keys if user-facing
7. Write a test in `tests/test_agent_*.py`

## Key Files

| File | Purpose |
|---|---|
| `packages/modules/agent/core/engine.py` | Main agent loop, session persistence, prompt composition |
| `packages/modules/agent/core/registry.py` | Tool registry, dispatch, validation, persona gating |
| `packages/modules/agent/core/context.py` | `AgentContext` — tenancy, user, session info passed to every tool |
| `packages/modules/agent/core/appliers.py` | Two-phase commit appliers for destructive tools |
| `packages/modules/agent/core/knowledge.py` | Hybrid search: vector + static YAML |
| `packages/modules/agent/core/agent_definition_service.py` | DB-driven agent definition CRUD + defaults |
| `packages/modules/agent/core/orchestrator.py` | Lightweight routing: which agent definition handles this turn |
| `packages/modules/agent/tools/expense_ops.py` | Core expense CRUD and approval workflow |
| `packages/modules/agent/tools/readiness_tools.py` | Tenant validation diagnostics |
| `packages/modules/agent/tools/registry_all.py` | Import-side-effect: imports all tool modules to trigger registration |

## Design Decisions

- **Single engine, multiple personas**: One codebase, one chat endpoint. Personas and agent definitions control access.
- **Two-phase commit for destructive operations**: Prevents accidental data changes. LLMs hallucinate tool calls; receipts require human confirmation.
- **Hybrid RAG**: Vector search for semantic recall + static YAML for deterministic product knowledge.
- **Sync engine, async HTTP**: The engine is deliberately sync; SSE streaming is handled at the router layer with threadpool execution.
- **SQLite in tests, PostgreSQL in prod**: Tests run fast with `:memory:`; production uses pgvector for embeddings.
