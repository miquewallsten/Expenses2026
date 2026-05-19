# Agent Architecture — Financial Ops Platform

## Current Tool Files (173 tools registered)

```
packages/modules/agent/tools/
├── _common.py                  # Shared types
├── admin_tools.py              # Admin CRUD (users, policies, etc.)
├── admin_config.py             # Policy/notification config (3 tools) ★ NEW - was missing from registry
├── ai_policy.py                # AI policies (5 tools)
├── accounting/
│   └── __init__.py             # Re-exports accounting tools
├── accounting_category.py      # Category CRUD (2 tools)
├── accounting_config.py        # SAT mapping, presets (3 tools)
├── accounting_copilot_tools.py # Accounting v1 (11 tools)
├── accounting_copilot_tools_v2.py  # Accounting v2 (15 tools)
├── accounting_copilot_tools_intelligence.py  # Accounting v3/intelligence (21 tools) ← RENAMED from v3
├── config_patch.py             # Company/accounting/policy updates (3 tools)
├── creative.py                 # Approval chains, role templates (4 tools)
├── diagnostic.py                # Diagnostics (3 tools)
├── expense_bundling.py         # Expense report bundling (1 tool) ★ FIXED - was missing handler
├── expense_ops.py              # Expense CRUD (5 tools)
├── expense_validation.py       # Policy validation (1 tool)
├── finance_copilot.py          # CFDI matching, month-end (4 tools)
├── infra.py                    # Archive, storage, export (6 tools)
├── ingestion.py                # File upload + analyze_file (4 tools)
├── knowledge_tools.py          # How-to, search, get (3 tools)
├── memory.py                   # Remember/recall/save preferences (4 tools)
├── org.py                      # Legal entities, clients, projects (8 tools)
├── rbac.py                     # Role/permission management (8 tools)
├── read_tools.py               # Read queries (5 tools)
├── readiness_tools.py          # Tenant readiness (3 tools)
├── registry_all.py             # ← Imports all modules to trigger registration
├── report_builder.py           # Expense report builder (5 tools)
├── search.py                   # Search expenses/users/projects (3 tools)
├── settings.py                 # Auth, channels, report cycle (6 tools)
├── workflow.py                 # Workflow stages/transitions (3 tools)
│
├── channel/                    # WhatsApp + Email integration
│   ├── spend_reports.py        # Spend summaries (3 tools)
│   ├── time_tracking.py        # Time tracking (4 tools)
│   ├── whatsapp_approve.py    # WhatsApp approvals (3 tools)
│   └── whatsapp_expense.py     # WhatsApp expense submission (2 tools)
│
├── platform/                   # Super Admin platform tools
│   ├── mailbox_tools.py        # Email testing (2 tools)
│   ├── provider_tools.py       # LLM provider CRUD (3 tools)
│   └── tenant_tools.py         # Tenant CRUD (4 tools)
│
└── work/
    └── bulk_ops.py             # Bulk expense updates (1 tool)
```

## Bugs Found & Fixed

1. **admin_config.py** — 3 tools (`update_company_policy`, `configure_notifications`, `get_current_config`) were NOT registered because `admin_config` was missing from `registry_all.py`. **Fixed: added import.**

2. **expense_bundling.py** — `bundle_expenses` tool was missing the `handler` parameter in its `ToolSpec` registration. **Fixed: added `handler=_bundle_expenses`.**

3. **accounting_copilot_tools_v3.py** — Renamed to `accounting_copilot_tools_intelligence.py` for clarity. Updated imports in `registry_all.py` and `accounting/__init__.py`.

## Agent Personas & Tool Counts

| Persona     | Tools | Description |
|-------------|-------|-------------|
| admin       | 166   | Full system access |
| accounting  | 108   | Accounting domain + read-only admin config |
| employee    | ~20   | Expense creation, time tracking |
| super_admin | 173   | Platform management |
| procurement | ~15   | Purchase requests |

## Copilot Architecture

```
User → CopilotLauncher (Cmd/Ctrl+K)
  ├─ Admin pages → persona="admin" (166 tools)
  └─ Accounting pages → persona="accounting" (108 tools)
       │
       ▼
  AgentChat → POST /agent/chat/{cid}
       │
       ▼
  Agent Engine (engine.py)
  ├─ Resolves LLM provider (DB → env → auto-detect)
  ├─ Composes system prompt (persona + context + memory + insights)
  ├─ Selects tools for persona
  ├─ Runs agentic loop (max 20 iterations, 80 session turns)
  └─ Returns response + tool calls + pending receipts
```

## Role Permission Boundaries

- **Admin**: Full access (166 tools) — users, policies, workflows, channels, auth, accounting, everything
- **Accounting**: Domain access (108 tools) — accounting setup, categories, reports, vendors, rules, month close, poliza. **READ-ONLY** on admin config. **Cannot**: create users, change policies, workflows, channels, auth settings, archive config, RBAC.

## File Upload Flow

Backend accepts 18 MIME types (images, PDF, Excel, CSV, XML, DOCX, ZIP, text).
Frontend `accept` attribute matches all backend types.
`analyze_file` tool auto-detects content and routes to appropriate action.
