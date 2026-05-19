@AGENTS.md

## Design System — OpsFlow Enterprise Command Center

Professional, bold, clean. Dual-mode equal theming with indigo accent (hue 275). See `globals.css` for token definitions.

### Semantic Color Tokens

Use **semantic tokens only** — never raw colors, never opacity hacks. The theme system handles dark/light automatically.

| Token | Purpose | Dark Mode | Light Mode |
|---|---|---|---|
| `surface-0` | Canvas / app background | Deep dark | Warm white |
| `surface-1` | Panel / sidebar / top bar | Elevated | White |
| `surface-2` | Card / section | More elevated | Light gray |
| `surface-3` | Hover / dropdown | Highest dark | Medium gray |
| `surface-4` | Modal / toast | Peak elevation | Darker gray |
| `primary` | Body text, headings | Near white | Near black |
| `secondary` | Secondary text | 65% lightness | 35% lightness |
| `tertiary` | Muted text | 45% lightness | 50% lightness |
| `muted` | Very muted, disabled | 30% lightness | 65% lightness |
| `subtle` | Hairline border | 6% opacity | 5% opacity |
| `default` | Standard border | 10% opacity | 10% opacity |
| `strong` | Emphasized border | 16% opacity | 16% opacity |
| `accent` | Primary action | Indigo 55% | Indigo 48% |
| `accent-muted` | Accent background | 15% accent | 10% accent |
| `success` | Success state | Emerald 70% | Emerald 55% |
| `warning` | Warning state | Amber 75% | Amber 65% |
| `error` | Error state | Rose 62% | Rose 55% |

### Usage Patterns

```
Backgrounds: bg-surface-0, bg-surface-1, bg-surface-2, bg-surface-3, bg-surface-4
Text: text-primary, text-secondary, text-tertiary, text-muted
Borders: border-subtle, border-default, border-strong
Accent: bg-accent, text-accent, bg-accent-muted, hover:bg-accent-hover
Semantic: text-success, bg-success-muted, text-warning, bg-warning-muted, text-error, bg-error-muted
```

### Typography

- **Font stack**: System fonts (`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif`)
- **Mono stack**: `"SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, monospace`
- **Sizes**: `text-xs` (11px), `text-sm` (13px), `text-base` (15px), `text-lg` (18px), `text-xl` (24px), `text-2xl` (32px)

### Spacing

- `space-1` (4px), `space-2` (8px), `space-3` (12px), `space-4` (16px), `space-5` (24px), `space-6` (32px)

### Border Radius

- `radius-xs` (4px), `radius-sm` (6px), `radius-md` (8px), `radius-lg` (12px), `radius-xl` (16px), `radius-2xl` (24px), `radius-full` (9999px)

### Component Utilities (globals.css)

Use these pre-built classes:

- **Buttons**: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-icon`
- **Inputs**: `.input`
- **Cards**: `.card`, `.card-header`, `.card-body`, `.card-footer`
- **Navigation**: `.nav-sidebar`, `.nav-item`, `.nav-item.active`
- **Rows**: `.row-interactive`, `.row-interactive.selected`
- **Badges**: `.badge`, `.badge-success`, `.badge-warning`, `.badge-error`, `.badge-neutral`
- **Chat**: `.chat-message.user`, `.chat-message.assistant`
- **Top bar**: `.top-bar`

### Animations

- `.animate-fade-in`, `.animate-slide-up`, `.animate-slide-in-right`, `.animate-scale-in`
- `.skeleton` for loading states

### Rules

1. **Never** use raw hex/rgb in className
2. **Never** use `dark:` prefixes — semantic tokens handle theming
3. **Never** use `white/` or `black/` opacity patterns
4. **Never** use `zinc-*`, `slate-*`, `neutral-*` directly — use semantic tokens
5. **Always** use semantic tokens: `bg-surface-0`, `text-primary`, `border-subtle`
6. **For SVG**: use `currentColor` for stroke/fill

### Theme Toggle

- Stored in `localStorage` as `pref_theme`
- `ThemeProvider` applies `dark` (default) or `light` class to `<html>`
- `html.light` selector in globals.css overrides token values for light mode
## Mandatory Design Rules

These are **non-negotiable**. Any PR that violates them must be rejected. Run `npx next build` + `npm test` before considering a change done.

### Token Enforcement

- **NEVER** use raw hex (`#3b82f6`), `rgb()`, or `rgba()` in className or style props. Use CSS `var(--color-*)` references or Tailwind semantic utilities.
- **NEVER** use `border-white/*`, `divide-white/*`, `ring-white/*`, `bg-white/*` opacity patterns. These are dark-mode-only and break in light mode. Use `border-subtle`, `border-default`, `border-strong`, `bg-surface-2` instead.
- **NEVER** use `dark:` prefixes. Semantic tokens handle theming via CSS custom properties.
- **NEVER** use `zinc-*`, `slate-*`, `neutral-*` directly. Use semantic tokens.
- **For SVG inline attributes**: use `var(--color-emerald-300)`, `var(--color-accent)` etc. for `fill`/`stroke` attributes. Never hardcode hex.

### Anti-Pattern Bans

| Pattern | Rule |
|---|---|
| Gradient backgrounds | No `bg-gradient-*` on cards, buttons, or sections. Flat colors only. Login pages may have minimal gradient borders as the sole exception. |
| Glassmorphism | No `backdrop-blur` greater than 2px (`backdrop-blur-[2px]` max). Functional overlays (modal backdrops) only. |
| Decorative blur blobs | No `blur-2xl` or `blur-3xl`. Use `blur-xl` max, and keep blob sizes under 200px. |
| Hero metrics | No `text-3xl`+ for numeric KPIs. Max `text-xl` for single numbers, `text-lg` with `text-[11px]` label below. |
| Side-stripe borders | No `border-l-2` or wider colored accent strips on cards/list items. Use `border-default` + `bg-accent-muted` background tint instead. |
| Em dashes | Never use `—`. Use ` - ` (space-hyphen-space) or restructure the sentence. |
| Identical card grids | No 3+ identical icon+heading+text cards in a grid. Vary layout. |
| Modal as first thought | Exhaust inline and progressive disclosure before reaching for a modal. |

### Status Styles

All status badges/pills **must** use the centralized maps in `web/lib/status-styles.ts`:

```tsx
import { statusClasses, EXPENSE_STATUS_STYLES, REQUEST_STATUS_STYLES, STATUS_TONE_STYLES } from "@/lib/status-styles";

// Expense/approval statuses
<span className={`rounded-full border px-2 py-0.5 text-[9px] ${statusClasses(e.status)}`}>

// Purchase request statuses
<span className={statusClasses(status, REQUEST_STATUS_STYLES)}>

// Generic tone (success/warning/error/info)
<span className={`${STATUS_TONE_STYLES[tone].bg} ${STATUS_TONE_STYLES[tone].text}`}>
```

**NEVER** define a local `STATUS_CLS`, `STATUS_CONFIG`, `STATUS_COLORS`, or `STATUS_MAP` constant in a module file. Import from `status-styles.ts`.

### Save Buttons

- All admin save actions use `bg-accent` + `text-white` + `py-1.5` + `shadow-sm` + `hover:bg-accent-hover`.
- Place save buttons in the `PremiumHeader` action slot (right side of section header), not in a footer bar.
- Icon: `<Save className="h-3.5 w-3.5" />` + `{tc("save")}` label.
- Disabled state: `disabled:opacity-40`.

### i18n

- **NEVER** hardcode user-visible English strings in component JSX. Always use `useTranslations()`.
- Add keys to both `web/messages/es.json` and `web/messages/en.json` — zero key drift.
- Verify: `python3 -m json.tool web/messages/es.json > /dev/null && python3 -m json.tool web/messages/en.json > /dev/null && echo OK`
- Namespaces: `admin.*`, `employee.*`, `manager.*`, `timeTracking.*`, `financeAnalytics.*`, etc.

### HeroHeader

- The greeting header at top of workspace is `rounded-xl border border-default bg-surface-1 px-4 py-3` (compact, not oversized).
- No decorative blur blobs, no gradient backgrounds, no large icon rings.
- Max icon: `h-9 w-9 rounded-lg bg-accent/10`.

### Light Mode

- All tokens in `globals.css` `html.light { }` block must be complete (surfaces, text, borders, accent, semantic, shadows, color scales).
- Before adding a new CSS custom property, add both dark and light variants.
- Test both themes before shipping.

### Pre-commit Checklist

Before any PR is considered complete:

```bash
# 1. Build must pass
npx next build

# 2. Tests must pass
npm test

# 3. Zero hardcoded hex in TSX
grep -rn '#[0-9a-fA-F]\{6\}' components/ modules/ app/ --include='*.tsx' | grep -v 'globals.css\|content=\|var(' | wc -l
# Must return: 0

# 4. Zero white/opacity tokens
grep -rn 'border-white\|divide-white\|ring-white\|bg-white/' components/ modules/ app/ --include='*.tsx' | grep -v 'bg-white shadow\|bg-white transition\|bg-white/70' | wc -l
# Must return: 0

# 5. Zero decorative gradients
grep -rn 'bg-gradient' components/ modules/ app/ --include='*.tsx' | wc -l
# Must return: 0

# 6. Zero em dashes
grep -rn ' — ' components/ modules/ app/ --include='*.tsx' | grep -v '\/\/' | wc -l
# Must return: 0

# 7. Zero local STATUS_CLS maps
grep -rn 'STATUS_CLS\|STATUS_CONFIG\|STATUS_COLORS' modules/ --include='*.tsx' | grep -v 'status-styles' | wc -l
# Must return: 0
```

### Super Admin Module

The `web/app/super-admin/` module follows the same design system as the rest of the app. It **must** use:

- **Layout**: Uses `NavRail` component from `@/components/shell/NavRail` (not a custom horizontal tab bar)
- **Page headers**: `PremiumHeader` from `@/components/admin/shared/AdminPatterns`
- **Sections**: `SectionPanel` from `@/components/admin/shared/AdminPatterns`
- **Form inputs**: `inputClasses` from `@/components/admin/shared/AdminPatterns`
- **Status badges**: `StatusBadge` from `@/components/admin/shared/AdminPatterns`
- **Toggles**: `Toggle` from `@/components/admin/shared/AdminPatterns`
- **i18n**: All strings under `superAdmin` namespace in `es.json`/`en.json`
- **Layout structure**: NavRail on left, header bar on top, content scrollable below

**Forbidden patterns in Super Admin:**
- Custom horizontal tab navigation (use NavRail)
- Custom `roleColors` maps (use `ROLE_CLASSES` with semantic tokens)
- Custom `PERSONA_COLORS` with hardcoded hex (use semantic tokens: accent-muted, success-muted, error-muted)
- Separate nested layouts (agent-center has no separate layout.tsx)
- Hardcoded English strings (always `useTranslations("superAdmin")`)
- Inline input styles (always `inputClasses.base`, `.select`, `.mono`, `.textarea`)
