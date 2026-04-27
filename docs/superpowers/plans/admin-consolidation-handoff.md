# Admin Consolidation — Handoff to Copilot Agent (Sonnet 4.6)

**Branch**: `feature/phase-1-channels`
**Last commit**: `80a3606` feat(admin): customer-admin/super-admin split
**Alembic head**: `a4b8c1d2e9f3` (host + OrbStack stamped)
**Status**: Slice 1 (super-admin split) shipped + verified. Frontend OrbStack image rebuild blocked by 11 pre-existing TS errors. Slices 2-5 are deferred and ready for Copilot Agent to execute.

---

## Operating Rules (read first)

1. **One slice at a time**, in the order below. Each slice ends with verification before moving on.
2. **Never skip verification**. Every slice's "Verify" block is a hard gate.
3. **i18n parity is mandatory.** After every keystring change run:
   ```
   python3 -m json.tool web/messages/es.json > /dev/null && python3 -m json.tool web/messages/en.json > /dev/null && echo OK
   cd web && npm run i18n:check:parity
   ```
4. **Follow `web/CLAUDE.md`** for tokens (dark-zinc, dense, no consumer spacing/gradients).
5. **Don't refactor adjacent code.** Touch only files listed in each slice.
6. **If a slice's TS check fails on UNRELATED code** (e.g. orchestrator/copilot WIP), note it and continue — Slice 0 fixes those.
7. **Commit after every green slice** with the suggested message. Never `--no-verify` unless told.

---

## Slice 0 — Unblock frontend rebuild (PRIORITY)

`next build --turbopack` currently fails on user's pre-existing TS errors. Until these are fixed, the OrbStack frontend container can't rebuild and customers/super-admin UI changes won't surface on `:3001`.

### 0.1 Fix `components/admin/AdminSetupOrchestratorPanel.tsx`

Five errors at lines ~758, ~809, ~824, ~1041, ~1066: TS narrows `st?.status` to `"error" | "pending" | "running"` when comparing against `"done"`, and `summary?.outcome` to `"awaiting_approval" | undefined` when comparing against `"no_changes"`.

**Pattern**: Each `st?.status !== "done"` and `summary?.outcome === "no_changes"` lives inside a branch where TS has already narrowed the union. Fix by widening the comparison via the underlying value's declared type.

**Investigation steps**:
1. Open the file. Search for the `ExecStatus` interface (line ~83) and confirm `status` includes `"done"`.
2. For each error line, find where `st` is bound (likely a Map/Record lookup) and check whether the lookup return type is being narrowed by a prior guard (e.g. `if (st?.status === "pending") return ...`).
3. The fix in 4 of 5 cases is to remove a redundant prior narrowing branch OR widen the access via `(st as ExecStatus | undefined)?.status`.
4. For the `summary?.outcome` cases, check the type of `summary` — it's likely typed as the response of one execution path that doesn't include `"no_changes"`. Either expand the union or restructure the conditional.

**Acceptance**: `cd web && npx tsc --noEmit 2>&1 | grep AdminSetupOrchestratorPanel | wc -l` returns `0`.

### 0.2 Fix `components/shell/AICopilotRail.tsx`

Six errors at lines 390, 433, 436, 439, 442: `Cannot find name 'expenseContext'`. The variable was removed from scope but references remain.

**Investigation steps**:
1. Open the file. `grep -n "expenseContext" web/components/shell/AICopilotRail.tsx`.
2. Check imports + hooks at top of file. The variable was likely renamed or moved into a hook return value.
3. Either re-introduce the binding (preferred if the variable is still meaningful) or replace each reference with the new name/derived value.
4. Ask the user before deleting any rendering branches that depend on `expenseContext`.

**Acceptance**: `cd web && npx tsc --noEmit 2>&1 | grep AICopilotRail | wc -l` returns `0`.

### 0.3 Verify

```bash
cd web && rm -rf .next && npx tsc --noEmit 2>&1 | tail -5      # no errors
cd web && npx vitest run --reporter=dot 2>&1 | tail -3          # 56/56
cd web && npx next build --turbopack 2>&1 | tail -5              # exit 0
```

### 0.4 Commit

```
fix(web): resolve TS errors in AdminSetupOrchestratorPanel + AICopilotRail

Unblocks production build for OrbStack frontend image rebuild.
- Orchestrator: widen ExecStatus narrowing on 5 status comparisons.
- AICopilotRail: re-bind expenseContext (was removed in WIP).

Verified: tsc clean, vitest 56/56, next build exits 0.
```

### 0.5 OrbStack rebuild

```bash
cd web && docker build -t financial-ops-platform-frontend -f ../infrastructure/docker/Dockerfile.frontend . && cd ..
FRONTEND_HOST_PORT=3001 docker compose up -d --no-deps frontend
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/admin       # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/super-admin # 200 OR 307 (redirect to /admin for non-super)
```

---

## Slice 1 — Policies merge (Expense Policy + AI Policy)

User quote: *"I love the AI Expense policy creator.. merge it and make it amazing."*

Merge `/admin/expense-policy` and `/admin/ai-policy` (the rule-based, NOT the engine governance one — that one is now `/super-admin/ai-policy`) into a single `/admin/policies` surface. AI prompt-first: user types natural-language policy, backend generates rule list, "edit raw fields" drawer for power users, live tester pane.

### 1.1 Files to touch

- **NEW**: `web/app/admin/policies/page.tsx` (the merged page)
- **READ for inspiration**:
  - `web/app/admin/expense-policy/page.tsx` (existing rule editor)
  - `web/app/admin/ai-policies/page.tsx` (existing AI policy creator — find via `find web/app/admin -name 'page.tsx' | xargs grep -l 'ai-polic'`)
- **EDIT**: `web/app/admin/page.tsx` — `WORKLIST_GROUPS`: replace `"Expense Policy"` with `"Policies"`. Add `WORKLIST_ICONS["Policies"]`. Add hints record entry.
- **EDIT**: `web/messages/es.json` + `web/messages/en.json` — add `admin.policies.*` namespace; deprecate `admin.expensePolicy.*` keys ONLY if no longer referenced.

### 1.2 Layout

Three-pane layout (dense, dark-zinc per `web/CLAUDE.md`):

```
┌─────────────────────────┬──────────────────────────────┐
│ Left: Rule list         │ Right top: AI prompt input   │
│ (selectable, prio, on/  │ + "Generate rules" button    │
│ off pill, plain-lang    │                              │
│ summary per rule)       ├──────────────────────────────┤
│                         │ Right mid: Selected rule —   │
│ + "New rule" button     │ raw JSON editor + form view  │
│                         │ tabs                         │
│                         ├──────────────────────────────┤
│                         │ Right bottom: Live tester —  │
│                         │ paste expense JSON, see      │
│                         │ pass/fail + which rule       │
└─────────────────────────┴──────────────────────────────┘
```

### 1.3 Backend (likely already exists — verify, don't rebuild)

- `GET /admin/policies/{cid}` — list rules
- `POST /admin/policies/{cid}` — create rule (JSON body)
- `PATCH /admin/policies/{cid}/{rule_id}` — update
- `DELETE /admin/policies/{cid}/{rule_id}` — delete
- `POST /admin/policies/{cid}/generate-from-prompt` — NL prompt → generated rules (may need to be added; check `packages/modules/admin/api/ai_policy_router.py`)
- `POST /admin/policies/{cid}/test` — submit test expense JSON, return matching rules + verdict

If `/generate-from-prompt` doesn't exist, copy the pattern from existing AI policy creator's prompt → rules generation.

### 1.4 Verify

```bash
cd web && npx vitest run --reporter=dot                         # 56/56
cd web && npx tsc --noEmit | grep -v "OrchestratorPanel\|AICopilotRail" | tail -5  # clean
python3 -m json.tool web/messages/es.json >/dev/null && python3 -m json.tool web/messages/en.json >/dev/null && echo OK
cd web && npm run i18n:check:parity
pytest tests/test_critical_paths.py -q                          # green
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/admin/policies  # 200 after rebuild
```

### 1.5 Commit

```
feat(admin): merge Expense Policy + AI Policy into unified Policies surface

- /admin/policies: 3-pane (rule list / NL prompt + raw editor / live tester).
- Backend: reuse existing rule CRUD; add /test endpoint if missing.
- WORKLIST_GROUPS: "Expense Policy" → "Policies".
- i18n: admin.policies.* (es/en parity).
```

---

## Slice 2 — Visual Workflow Map

User quote: *"build a amazing Workflow interactive MAP"*

Replace `/admin/approval-setup` and `/admin/workflow-setup` with a single visual `/admin/workflow` page: SVG node-edge canvas. Nodes = approval stages (draft, submitted, manager_approved, etc.), edges = transitions. Click a node to inspect/edit who approves, SLA, auto-approve rules, notifications. Click an edge to inspect transition rules. Presets: Simple / Two-tier / Auto-approve-small / Custom.

### 2.1 Files to touch

- **NEW**: `web/app/admin/workflow/page.tsx`
- **NEW**: `web/components/admin/workflow/WorkflowCanvas.tsx` (SVG renderer)
- **NEW**: `web/components/admin/workflow/StageInspector.tsx` (right drawer when node clicked)
- **NEW**: `web/components/admin/workflow/TransitionInspector.tsx` (right drawer when edge clicked)
- **NEW**: `web/components/admin/workflow/presetPicker.tsx`
- **EDIT**: `web/app/admin/page.tsx` — `WORKLIST_GROUPS`: replace `"Approval Setup"` + `"Workflow Setup"` with single `"Workflow"`. Add icon + hint.
- **READ**: existing approval-setup + workflow-setup pages for the data model.
- **READ**: `packages/modules/admin/service/workflow_setup_service.py` (currently a stub I added — extend it).

### 2.2 Backend extensions

The `WorkflowStage` and `WorkflowTransition` tables already exist (per plan). Confirm endpoints:
- `GET /admin/workflow/{cid}` — full graph (stages + transitions)
- `PATCH /admin/workflow/{cid}/stages/{stage_id}` — edit stage config
- `PATCH /admin/workflow/{cid}/transitions/{transition_id}` — edit transition config
- `POST /admin/workflow/{cid}/preset/{preset_key}` — apply a preset (Simple/Two-tier/Auto-approve-small)

If endpoints are missing, scaffold them in `packages/modules/admin/api/workflow_router.py` and wire to `apps/api/main.py`. Add a tiny pytest in `tests/test_workflow_admin.py` covering GET + preset apply.

### 2.3 Canvas UX

- 800×500 SVG, nodes auto-layout left→right by stage order.
- Nodes: rounded rectangles, dark-zinc fill, role-tinted border (employee=zinc, manager=sky, accountant=violet, paid=emerald, rejected=rose).
- Edges: bezier curves, arrowhead at target. Active edge on hover = white. Click = open inspector.
- No drag-to-rearrange in v1. Zoom/pan deferred.
- Empty state: shows preset picker centered.

### 2.4 Verify

```bash
cd web && npx vitest run --reporter=dot
cd web && npx tsc --noEmit | grep -v "OrchestratorPanel\|AICopilotRail" | tail -5
pytest tests/test_workflow_admin.py tests/test_critical_paths.py -q
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/admin/workflow
```

### 2.5 Commit

```
feat(admin): visual Workflow Map (replaces Approval Setup + Workflow Setup)

- /admin/workflow: SVG node-edge canvas with click-to-inspect.
- Stage + transition editors as right drawers.
- Presets: Simple, Two-tier, Auto-approve-small, Custom.
- Backend: workflow_router CRUD + preset endpoint.
- WORKLIST_GROUPS: collapses Approval+Workflow into single "Workflow".
- i18n: admin.workflow.* (es/en parity).
```

---

## Slice 3 — Accounting tabs

Single Accounting Setup entry with internal tabs: Setup · Chart of Accounts · Dimensions. Removes 2 worklist items.

### 3.1 Files to touch

- **EDIT**: `web/app/admin/accounting-setup/page.tsx` — wrap existing content in tabs.
- **MOVE inline (don't redirect)**: content from `web/app/admin/chart-of-accounts/page.tsx` and `web/app/admin/dimensions/page.tsx` into tab panels via dynamic import or shared component extraction.
- **DELETE pages**: `web/app/admin/chart-of-accounts/page.tsx` and `web/app/admin/dimensions/page.tsx` AFTER content is moved. Keep redirects: add `redirect("/admin/accounting-setup?tab=chart")` etc. in their place.
- **EDIT**: `web/app/admin/page.tsx` — `WORKLIST_GROUPS`: remove `"Chart of Accounts"` and `"Dimensions"` from `Setup`. Keep only `"Accounting Setup"`. Remove from `WORKLIST_ICONS` + hints.
- **EDIT**: i18n — add `admin.accountingSetup.tabs.{setup,chart,dimensions}`. Don't remove `admin.chartOfAccounts.*`/`admin.dimensions.*` keys (still used by extracted components).

### 3.2 Tab UX

Tabs render as a thin row at the top of the page, dense, underline-on-active. Use existing tab pattern from `web/components/expense/EmployeeExpenseDetail.tsx` if available, otherwise minimal.

URL state: `?tab=setup|chart|dimensions`. Default `setup`. Update on click without full navigation (`router.replace`).

### 3.3 Verify

```bash
cd web && npx vitest run --reporter=dot
cd web && npx tsc --noEmit | grep -v "OrchestratorPanel\|AICopilotRail" | tail -5
python3 -m json.tool web/messages/es.json >/dev/null && python3 -m json.tool web/messages/en.json >/dev/null && echo OK
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/admin/accounting-setup
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/admin/chart-of-accounts  # should 200 via redirect
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/admin/dimensions         # should 200 via redirect
```

### 3.4 Commit

```
feat(admin): consolidate Accounting / Chart of Accounts / Dimensions into tabs

- /admin/accounting-setup gains tabs: Setup, Chart of Accounts, Dimensions.
- Old standalone pages 308-redirect to ?tab=...
- WORKLIST_GROUPS: removes Chart of Accounts + Dimensions worklist items.
- i18n: admin.accountingSetup.tabs.* (es/en parity).
```

---

## Slice 4 — Onboarding consolidation

User quote: *"be careful with Onboarding, Config Agent, Steps to setup, plus the Copilot"*

Single `/admin/onboarding` entry that folds in:
- `/admin/setup-assistant`
- `/admin/onboarding` (existing wizard)
- `/admin/agent` (config agent — ONLY the onboarding-relevant parts; runtime agent stays elsewhere)
- The setup copilot panel (likely `AdminSetupOrchestratorPanel`)

The ONE entry presents a guided flow: the existing wizard steps, with the orchestrator copilot as a right rail offering AI-guided suggestions per step.

### 4.1 Files to touch

- **EDIT**: `web/app/admin/onboarding/page.tsx` — fold setup-assistant + agent-config + orchestrator into right rail or sequential steps.
- **DELETE pages with redirects**:
  - `web/app/admin/setup-assistant/page.tsx` → `redirect("/admin/onboarding")`
  - `web/app/admin/agent/page.tsx` → if it's purely setup-config, redirect; if it's the runtime agent admin, leave it.
- **EDIT**: `web/app/admin/page.tsx` — `WORKLIST_GROUPS`: remove `"Setup Assistant"`, `"Config Agent"` if present. Keep `"Overview"` + `"Onboarding"` only in Setup intro slot.
- **EDIT**: i18n — extend `admin.onboarding.*`; remove obsolete namespaces only if zero references remain.

### 4.2 UX

Sequential 6-step wizard (Company → Legal entities → Chart of Accounts → Approval policy → User import → Go-live), with right rail (collapsed by default) holding the AI copilot. Each step has a "Suggest from AI" button that opens the rail with a step-specific prompt prefilled.

### 4.3 Verify

```bash
cd web && npx vitest run --reporter=dot
cd web && npx tsc --noEmit | grep -v "AICopilotRail" | tail -5   # OrchestratorPanel may be touched in this slice
pytest tests/test_critical_paths.py -q
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/admin/onboarding
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/admin/setup-assistant  # redirect
```

### 4.4 Commit

```
feat(admin): consolidate Onboarding / Setup Assistant / Config Agent into single entry

- /admin/onboarding now hosts the orchestrator copilot in a right rail.
- /admin/setup-assistant + agent-config redirect into /admin/onboarding.
- WORKLIST_GROUPS: collapses 4 entries → 1.
- i18n: admin.onboarding.* extended (es/en parity).
```

---

## Slice 5 — Final OrbStack deploy + retro

### 5.1 Rebuild + smoke

```bash
cd web && docker build -t financial-ops-platform-frontend -f ../infrastructure/docker/Dockerfile.frontend . && cd ..
FRONTEND_HOST_PORT=3001 docker compose up -d --no-deps frontend backend
sleep 8
curl -s http://localhost:8000/health         # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/admin                  # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/admin/policies         # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/admin/workflow         # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/admin/accounting-setup # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/admin/onboarding       # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/super-admin            # 307 (no super session)
```

### 5.2 Final test sweep

```bash
pytest tests/ -x --tb=line -q 2>&1 | tail -10
cd web && npx vitest run --reporter=dot 2>&1 | tail -5
cd web && npm run i18n:check:parity
```

### 5.3 Update `/memories/session/plan.md`

Mark Slices 1-4 done. Add final commit hashes. Note any items deferred again.

### 5.4 Stop point

Hand back to user with:
- summary of slice commits
- screenshot links for `/admin` (4 worklist groups now shorter), `/admin/policies`, `/admin/workflow`, `/admin/accounting-setup` (tabs), `/admin/onboarding`
- list of any TS warnings or pytest pre-existing failures still present

---

## Reference: Verification command appendix

```bash
# Full backend
pytest tests/ -x --tb=line -q

# Critical only (fast)
pytest tests/test_critical_paths.py tests/test_agent_engine.py tests/test_agent_phase_8.py tests/test_agent_knowledge.py tests/test_agent_ingestion.py --tb=line -q

# Frontend tests
cd web && npx vitest run --reporter=dot

# Type check (excluding known WIP)
cd web && npx tsc --noEmit 2>&1 | grep -v "AdminSetupOrchestratorPanel\|AICopilotRail" | tail -10

# i18n parity (must be exact)
python3 -m json.tool web/messages/es.json > /dev/null && python3 -m json.tool web/messages/en.json > /dev/null && echo OK
cd web && npm run i18n:check:parity

# Production build
cd web && rm -rf .next && npx next build --turbopack 2>&1 | tail -5

# OrbStack rebuild
cd web && docker build -t financial-ops-platform-frontend -f ../infrastructure/docker/Dockerfile.frontend . && cd ..
FRONTEND_HOST_PORT=3001 docker compose up -d --no-deps frontend

# Alembic head check
docker exec financial-ops-platform-backend-1 alembic current
# Expected: a4b8c1d2e9f3 (head)
```

## Reference: i18n keystring rules (from `CLAUDE.md`)

- `web/messages/es.json` is source of truth (Spanish MX primary).
- `web/messages/en.json` mirrors exactly — zero key drift.
- Namespaces match component domain: `admin.policies`, `admin.workflow`, etc.
- Keys are camelCase English; values are in the locale's language.
- Never translate AI prompt text sent to the backend — only user-visible labels.

## Reference: Style rules (from `web/CLAUDE.md`)

- Dark-mode only (zinc-950 chrome, white/65 muted text on <14px).
- Dense enterprise spacing — no consumer padding/gradients.
- 1px borders on white/[0.08], hover white/15.
- Rose=destructive, amber=warn, emerald=success, sky=info, violet=AI/feedback.
- Use lucide-react icons, h-3.5 w-3.5 in worklist, h-4 w-4 in panels.

## Reference: When stuck

- Ask user before deleting any file.
- Ask user before adding new dependencies (`npm install` / `pip install`).
- If a slice's UX feels off, post mockup descriptions before coding.
- If a backend endpoint doesn't exist, prefer extending an existing router over creating a new one.
- If `pytest` fails on something you didn't touch, log it under "pre-existing" and continue.
