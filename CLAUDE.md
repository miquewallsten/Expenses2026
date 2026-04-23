# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (`web/`)
```bash
npm run dev      # Dev server on :3000 (Turbopack)
npm run build    # Production build
npm run lint     # ESLint
```

### Backend (Python, run from repo root)
```bash
python -m uvicorn apps.api.main:app --reload   # Dev server on :8000
pip install -r requirements.txt                 # Install deps
alembic upgrade head                            # Run migrations
pytest tests/                                   # Full test suite
pytest tests/test_critical_paths.py::test_name  # Single test
```

## Architecture

### Monorepo Layout

```
web/               # Next.js 16 frontend (App Router, Turbopack)
apps/api/          # FastAPI entry point — mounts all routers
packages/core/     # Shared domain models and business logic
  config_engine/   # Setup/onboarding workflows
  platform/        # Multi-tenant models: User, Company, Role, Audit
packages/modules/  # Pluggable business modules
  expenses/        # Primary module — expense reports, CFDI, approval
  accounting/      # Category mapping, export bundles, Poliza vouchers
  admin/           # Admin setup and portal configuration
  ai/              # Ollama-based categorization and document analysis
  channels/        # WhatsApp webhook + email inbound
  requests/        # Purchase requests
  time_tracking/   # Project/activity tracking
alembic/           # SQLAlchemy migrations
tests/             # Pytest suite (SQLite :memory: — never hits real DB)
```

### Backend

FastAPI + SQLAlchemy 2.0 + Pydantic 2. Each module under `packages/modules/` registers its own router; `apps/api/main.py` mounts them all. Models use SQLAlchemy declarative base; Pydantic schemas are co-located with routers (not models).

**Database**: PostgreSQL 16 in dev/prod (`DATABASE_URL` in `.env`). Migrations via Alembic. Tests use SQLite `:memory:`.

**Auth**: Magic-link flow — `POST /auth/magic-link/request` → email → `GET /auth/magic-link/verify?token=` → signed JWT. Frontend stores JWT in localStorage as `StoredSession` and sends `Authorization: Bearer <token>` on every request. Dev bypass: `X-User-Id` header.

### Frontend

Next.js 16 App Router. All API calls are plain `fetch()` with Bearer tokens — no tRPC or GraphQL. Session helpers live in `web/lib/session.ts`.

**Design system**: Dark-mode only. See `web/CLAUDE.md` for the full color/spacing/typography token reference — those rules are mandatory on every component.

**i18n**: `next-intl` is wired in; Spanish is the default locale.

### Domain Model

The core entity is **Expense** — created by employees (via form, file upload, or WhatsApp), routed through a multi-stage approval chain (draft → submitted → manager\_approved → approved / rejected), then paired with a CFDI (Mexican tax receipt XML) and exported as an accounting bundle (**Poliza**).

Supporting models: `Company`, `LegalEntity`, `CostCenter`, `Client`, `Project`, `AccountingCategory`, `WorkflowStage`, `WorkflowTransition`. Multi-tenant isolation is enforced via `company_id` on every tenant-scoped model.

User capabilities are flags on the `User` model (`can_create_expenses`, `is_amex_reconciler`, `requires_time_tracking`, etc.) and fine-grained permissions via `Role → Permission → RolePermission`.

### AI Integration

Ollama runs locally. The `ai/` module calls it for expense categorization and document (receipt) analysis. Config via `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_NUM_CTX` in `.env`.

## AI Agent Collaboration

This project uses two AI agents in tandem. Use each for the right job to preserve Claude Code tokens.

### Claude Code (this agent)
- Architecture decisions, planning, and complex multi-file reasoning
- Backend Python work (FastAPI, SQLAlchemy, Alembic, pytest)
- Security-sensitive changes (auth, permissions, CORS)
- Debugging failures, reading test output, fixing type errors
- Final verification of any batch of changes

### GitHub Copilot Agent (Claude Sonnet 4.6 in VS Code)
Delegate heavy, repetitive, or well-specified tasks:
- **i18n string extraction** — reading components, adding keys to `web/messages/es.json` + `web/messages/en.json`, replacing hardcoded strings with `t()` calls
- **Bulk frontend edits** — adding auth headers, swapping import paths, renaming props across many files
- **Boilerplate generation** — new components that follow an established pattern
- **File-by-file migrations** — e.g. converting Pydantic v1 syntax to v2 across a module

**How to hand off to Copilot Agent:**
Give it self-contained instructions with: the exact files to touch, the pattern to follow (show one example), and a verification step (e.g. `python3 -m json.tool web/messages/es.json > /dev/null && echo OK`). It should work sequentially when tasks share files (JSON, shared modules).

**After Copilot Agent finishes:** always run verification in Claude Code before treating the task as done — JSON validation, `pytest tests/`, or a quick grep to confirm the pattern was applied correctly.

### i18n conventions
- `web/messages/es.json` is source of truth (Spanish MX primary)
- `web/messages/en.json` must mirror it exactly — zero key drift
- Namespaces match component domain: `admin.approvalSetup`, `employee.xmlDetail`, etc.
- Keys are camelCase English; values are in the locale's language
- Never translate AI prompt text sent to the backend — only user-visible labels
- Verify with: `python3 -m json.tool web/messages/es.json > /dev/null && python3 -m json.tool web/messages/en.json > /dev/null && echo OK`

## Style Guidelines
- Be extremely concise.
- Do not explain what you are about to do.
- Do not summarize what you just did.
- Silent mode: Only output the result of the command or the code changes.
- Skip all conversational pleasantries, intros, and outros.
- If a task is successful, respond with a single word: "Done."

## Environment

`.env` is committed with development defaults. Key variables:
- `DATABASE_URL` — PostgreSQL connection string
- `AUTH_SECRET` — JWT signing key (rotate in production)
- `ENVIRONMENT`, `DEBUG`
- `OLLAMA_*` — local LLM config

## Testing

Frontend: `cd web && npm test` (vitest). Files in `web/__tests__/`. See `TESTING.md` for full details.

Expectations:
- When writing new functions, write a corresponding test
- When fixing a bug, write a regression test
- When adding error handling, write a test that triggers the error
- When adding a conditional (if/else), write tests for both paths
- Never commit code that makes existing tests fail

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools directly.

Available gstack skills:
`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`

### Teammate setup

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
```

The `.claude/skills/gstack` symlink in this repo points to `~/.claude/skills/gstack`. Run the command above once and it will resolve automatically.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. The
skill has multi-step workflows, checklists, and quality gates that produce better
results than an ad-hoc answer. When in doubt, invoke the skill. A false positive is
cheaper than a false negative.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke /office-hours
- Strategy, scope, "think bigger", "what should we build" → invoke /plan-ceo-review
- Architecture, "does this design make sense" → invoke /plan-eng-review
- Design system, brand, "how should this look" → invoke /design-consultation
- Design review of a plan → invoke /plan-design-review
- Developer experience of a plan → invoke /plan-devex-review
- "Review everything", full review pipeline → invoke /autoplan
- Bugs, errors, "why is this broken", "wtf", "this doesn't work" → invoke /investigate
- Test the site, find bugs, "does this work" → invoke /qa (or /qa-only for report only)
- Code review, check the diff, "look at my changes" → invoke /review
- Visual polish, design audit, "this looks off" → invoke /design-review
- Developer experience audit, try onboarding → invoke /devex-review
- Ship, deploy, create a PR, "send it" → invoke /ship
- Merge + deploy + verify → invoke /land-and-deploy
- Configure deployment → invoke /setup-deploy
- Post-deploy monitoring → invoke /canary
- Update docs after shipping → invoke /document-release
- Weekly retro, "how'd we do" → invoke /retro
- Second opinion, codex review → invoke /codex
- Safety mode, careful mode, lock it down → invoke /careful or /guard
- Restrict edits to a directory → invoke /freeze or /unfreeze
- Upgrade gstack → invoke /gstack-upgrade
- Save progress, "save my work" → invoke /context-save
- Resume, restore, "where was I" → invoke /context-restore
- Security audit, OWASP, "is this secure" → invoke /cso
- Make a PDF, document, publication → invoke /make-pdf
- Launch real browser for QA → invoke /open-gstack-browser
- Import cookies for authenticated testing → invoke /setup-browser-cookies
- Performance regression, page speed, benchmarks → invoke /benchmark
- Review what gstack has learned → invoke /learn
- Tune question sensitivity → invoke /plan-tune
- Code quality dashboard → invoke /health
