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