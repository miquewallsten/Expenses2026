# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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

**Design system**: Dual-theme (dark + light) with system preference detection. See `web/AGENTS.md` for the full color/spacing/typography token reference — those rules are mandatory on every component.

**i18n**: `next-intl` is wired in; Spanish is the default locale.

### Domain Model

The core entity is **Expense** — created by employees (via form, file upload, or WhatsApp), routed through a multi-stage approval chain (draft → submitted → manager\_approved → approved / rejected), then paired with a CFDI (Mexican tax receipt XML) and exported as an accounting bundle (**Poliza**).

Supporting models: `Company`, `LegalEntity`, `CostCenter`, `Client`, `Project`, `AccountingCategory`, `WorkflowStage`, `WorkflowTransition`. Multi-tenant isolation is enforced via `company_id` on every tenant-scoped model.

User capabilities are flags on the `User` model (`can_create_expenses`, `is_amex_reconciler`, `requires_time_tracking`, etc.) and fine-grained permissions via `Role → Permission → RolePermission`.

### AI Integration

Ollama runs locally. The `ai/` module calls it for expense categorization and document (receipt) analysis. Config via `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_NUM_CTX` in `.env`.

## AI Agent Collaboration

This project uses two AI agents in tandem. Use each for the right job to preserve Codex tokens.

### Codex (this agent)
- Architecture decisions, planning, and complex multi-file reasoning
- Backend Python work (FastAPI, SQLAlchemy, Alembic, pytest)
- Security-sensitive changes (auth, permissions, CORS)
- Debugging failures, reading test output, fixing type errors
- Final verification of any batch of changes

### GitHub Copilot Agent (Codex Sonnet 4.6 in VS Code)
Delegate heavy, repetitive, or well-specified tasks:
- **i18n string extraction** — reading components, adding keys to `web/messages/es.json` + `web/messages/en.json`, replacing hardcoded strings with `t()` calls
- **Bulk frontend edits** — adding auth headers, swapping import paths, renaming props across many files
- **Boilerplate generation** — new components that follow an established pattern
- **File-by-file migrations** — e.g. converting Pydantic v1 syntax to v2 across a module

**How to hand off to Copilot Agent:**
Give it self-contained instructions with: the exact files to touch, the pattern to follow (show one example), and a verification step (e.g. `python3 -m json.tool web/messages/es.json > /dev/null && echo OK`). It should work sequentially when tasks share files (JSON, shared modules).

**After Copilot Agent finishes:** always run verification in Codex before treating the task as done — JSON validation, `pytest tests/`, or a quick grep to confirm the pattern was applied correctly.

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
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.Codex/skills/gstack && cd ~/.Codex/skills/gstack && ./setup
```

The `.Codex/skills/gstack` symlink in this repo points to `~/.Codex/skills/gstack`. Run the command above once and it will resolve automatically.

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

## Imported Claude Cowork project instructions

Be direct. Be clear.

Answer first. Keep it short.
Only what matters. Nothing extra.

No explanations. No reasoning. No “why”.
Do not explain how you got the answer.

No fluff. No corporate tone.

Give options only if useful. Keep them minimal.

Challenge my thinking.
Call out weak logic, risks, and blind spots.
No sugarcoating.

Keep things simple.
No overengineering.

Adjust fast based on feedback.
Do not defend previous answers.

Always tell the truth.
Never guess or make things up.
If unsure, say so briefly.

Use the same language I use.

Always /human, /truth,

## Frontend Design Rules (Mandatory)

All agents editing `web/` must follow these. Violations block merge.

### Token-First
- **Never** raw hex/rgb/rgba in className or style. Use `var(--color-*)` or Tailwind semantic utilities (`bg-surface-0`, `text-primary`, `border-subtle`).
- **Never** `border-white/*`, `divide-white/*`, `ring-white/*`, `bg-white/*`. Use `border-subtle`/`border-default`/`border-strong`/`bg-surface-2`.
- **Never** `dark:` prefixes. Semantic tokens handle theming via `html.light` overrides in `globals.css`.

### Anti-Pattern Bans
- **No** `bg-gradient-*` on cards/buttons/sections (login minimal gradient border = sole exception)
- **No** `backdrop-blur` > 2px
- **No** `blur-2xl` or `blur-3xl` decorative blobs
- **No** `text-3xl`+ hero metrics. Max `text-xl` for numbers.
- **No** `border-l-2`+ side-stripe accent strips
- **No** em dashes (`—`). Use ` - ` instead.
- **No** identical icon+heading+text card grids (3+)
- **No** modals when inline/progressive works

### Status Styles
- Import from `web/lib/status-styles.ts` only. Never define local `STATUS_CLS`/`STATUS_CONFIG`/`STATUS_COLORS` maps.

### Save Buttons
- `bg-accent text-white py-1.5 shadow-sm hover:bg-accent-hover disabled:opacity-40`. In `PremiumHeader` action slot.

### i18n
- No hardcoded English strings. `useTranslations()` always. Keys in both `es.json` + `en.json`.

### Pre-commit
- `npx next build` passes
- `npm test` passes
- Grep checks for hardcoded hex, white/opacity, gradients, em dashes, local status maps all return 0

### Theming (Dark + Light)
- The app supports dark, light, and system themes via `ThemeProvider` and `html.light`/`html.dark` class toggling.
- **Never** use hardcoded `bg-black/*`, `text-black/*`, or `text-white/*` (opacity variants) for backgrounds, separators, or overlays. Use these utility classes instead:
  - **Overlays**: `overlay-backdrop-blur` (modal/drawer backdrops with blur) or `overlay-backdrop` (without blur)
  - **Subtle sections**: `section-subtle` (replaces `bg-black/10`, `bg-black/20`, etc.)
  - **Separator dots**: `separator-dot` (replaces `text-white/5` bullets)
  - **Glass panels**: `.glass` (auto-adapts in light mode)
- **Never** use `dark:` Tailwind prefixes. Theme switching is handled by CSS custom properties under `html.light { ... }` in `globals.css`.
- To add a new light-mode override, add the variable in `@theme {}` (dark default) then override it in `html.light { ... }`.
- `text-white` on accent-colored buttons (`bg-accent`, `bg-error`, `bg-success`) is acceptable in both themes.
- `bg-white` on toggle knobs is acceptable in both themes.
- `bg-surface-2` or `bg-surface-3` replaces `bg-black/30` for input/textarea backgrounds.

### Shell Layout Guardrail (MANDATORY - Do Not Violate)

The mywork shell (`web/app/mywork/page.tsx`) follows a strict three-column layout. These rules are **frozen** and cannot be changed without explicit user approval:

1. **No HeroHeader, greeting banners, or overlines** in the workspace. Content starts immediately.
2. **No TopBar/toolbar** above the workspace on desktop. The sidebar contains all shell controls (theme toggle, settings).
3. **Sidebar**: 48px collapsed / 240px expanded. Theme toggle + Settings in footer. Module active state = accent tint + left accent bar.
4. **Copilot panel**: Always visible. Starts expanded (320px). Resizable 280-720px. Collapsible to 40px rail. Never removed or hidden by default.
5. **Mobile**: Bottom tab bar (top 4 modules + More + AI). No top bar. Copilot as sheet overlay.
6. **Tablet**: 48px sidebar rail. Copilot as column.
7. **CopilotSidebarContext defaults**: `open=true`, `width=320`. Do not change without approval.
8. **Copilot is called "Copilot"** in UI strings (not "Lola" or any other name in user-facing text).
9. **Provider order**: `UserProvider > PortalConfigProvider > MyWorkProvider > AdminProvider > CopilotSidebarProvider > NavCustomizationProvider`. This order is required to avoid `usePortalConfigContext()` errors.
