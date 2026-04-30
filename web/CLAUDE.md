@AGENTS.md

## Design System

This app uses an **Apple Design System** color palette mapped through Tailwind CSS custom properties. Both dark and light themes are fully supported. Follow these rules when creating or editing any component.

### Theme Architecture

**Never** use `dark:` prefixes or raw hex/rgb in `className`. The theme system handles both modes automatically through CSS custom property overrides in `globals.css`:

- `:root` — defines the dark mode token values
- `html.light` — overrides tokens for light mode

Components use Tailwind utilities like `bg-zinc-950`, `text-white/60`, `border-white/[0.07]`. The CSS variables `--color-zinc-950`, `--color-white`, etc. flip automatically when `html.light` is present.

### Apple Color Tokens (Dark → Light)

| Token | Dark Mode | Light Mode |
|---|---|---|
| `bg-zinc-950` | `#000000` (systemBackground) | `#F2F2F7` |
| `bg-zinc-900` | `#1C1C1E` (secondaryBackground) | `#FFFFFF` |
| `bg-zinc-800` | `#2C2C2E` (tertiaryBackground) | `#E5E5EA` |
| `text-white` | `#FFFFFF` (labels) | `#000000` |
| `text-white/60` | white at 60% opacity | black at 60% opacity |
| `border-white/[0.07]` | white at 7% opacity | black at 7% opacity |
| `text-indigo-300/80` | `#7DD4FF` at 80% | `#007AFF` at 80% |
| `bg-indigo-600/30` | `#0077E6` at 30% | `#007AFF` at 30% |
| `bg-emerald-500/70` | `#34C759` at 70% | `#34C759` at 70% |
| selection | `rgba(10,132,255,0.30)` | `rgba(0,122,255,0.20)` |
| focus ring | `#0A84FF` | `#007AFF` |

### Colors
- **Backgrounds**: `bg-zinc-950` (page/shell), `bg-zinc-900` (panels, drawers, popovers)
- **Text**: `text-white/60` (primary), `text-white/45` (secondary), `text-white/28` (muted), `text-white/18` (very muted)
- **Borders**: `border-white/[0.07]` (main dividers), `border-white/[0.06]` (section dividers), `border-white/[0.05]` (subtle)
- **Accent**: indigo/SF Blue — `bg-indigo-600/30` (icon bg), `text-indigo-300/80` (icon), `text-indigo-400/70` (active indicator), `border-indigo-500/25 bg-indigo-500/10` (badge/chip)
- **Interactive surfaces**: `hover:bg-white/[0.04]` to `hover:bg-white/[0.06]` on hover
- **Success**: `bg-emerald-500/70`, `text-emerald-400/80`
- **Danger**: `text-rose-400/80`, `border-rose-500/30`

### Typography
- **Font stack**: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
- **Mono stack**: `"SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
- Sizes: `text-[9px]` (overline/badge), `text-[10px]` (label/nav), `text-[11px]` (body-sm), `text-xs`/`text-sm` for content
- Use `uppercase tracking-widest font-bold` for section labels and overlines
- Use `tracking-tight` for truncated content

### Spacing & Layout
- Standard gap: `gap-1.5` (tight), `gap-2.5` (default)
- Standard padding: `px-2.5` (compact), `px-4` (panel), `py-1.5` (row items)
- Interactive rows: `h-6` (xs), `h-8` (sm), `h-9`/`h-10`/`h-11` (header bars)

### Rules
- Never use `neutral-*` colors — use `zinc-*` or `white/opacity` instead
- Never add `dark:` prefixes to existing classes — the token system handles theming automatically
- For new classes needing light-mode variants, use `[html.light_&]:` (e.g. `[html.light_&]:text-black/50`)
- Never use raw hex or `rgb()` values in className — use Tailwind utilities only
- Prefer `white/[0.xx]` fractional opacity for fine-grained control over borders and text
- For SVG attributes (`stroke`, `fill`), use `currentColor` instead of hardcoded `"white"` so they follow the CSS color token
- Use `suppressHydrationWarning` on elements that may differ between SSR and client (e.g. theme-dependent containers)

### Theme Toggle
- Settings → Appearance has a segmented control for dark/light/system
- Preference is stored in `localStorage` as `pref_theme`
- `ThemeProvider` reads this on mount and applies `dark` or `light` class to `<html>`
- `theme-color` meta tag updates dynamically
