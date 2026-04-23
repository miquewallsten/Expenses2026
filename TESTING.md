# Testing

100% test coverage is the key to great vibe coding. Tests let you move fast, trust your instincts, and ship with confidence — without them, vibe coding is just yolo coding. With tests, it's a superpower.

## Frontend (vitest + @testing-library/react)

**Run tests:**
```bash
cd web
npm test          # single run
npm run test:watch  # watch mode
```

**Test directory:** `web/__tests__/`

### Layers

- **Unit** — pure functions, utilities, session helpers (`lib/session.ts`, etc.)
- **Component** — React components with jsdom (`components/**/*.tsx`)
- **Integration** — form flows, API interactions mocked via `vi.mock`

### Conventions

- Files: `__tests__/ComponentName.test.tsx` or `__tests__/moduleName.test.ts`
- Imports: explicit from `vitest` (`describe`, `it`, `expect`, `vi`)
- Mock network: `vi.stubGlobal("fetch", vi.fn())`
- Mock next-intl: `useTranslations` returns key as value (configured in `vitest.setup.ts`)
- Mock next/navigation: pre-configured in `vitest.setup.ts`
- localStorage: use `vi.stubGlobal("localStorage", localStorageMock)` in `.ts` test files (jsdom doesn't fully expose localStorage in non-tsx environments in vitest 4)

## Backend (pytest)

**Run tests:**
```bash
pytest tests/                             # full suite
pytest tests/test_critical_paths.py::test_name  # single test
```

Tests use SQLite `:memory:` — never hit the real database.

## CI

GitHub Actions runs both suites on every push and pull request. See `.github/workflows/test.yml`.
