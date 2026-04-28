@AGENTS.md

## Design System

This app is a dark-mode-only financial ops UI. Follow these rules when creating or editing any component:

### Colors
- **Backgrounds**: `bg-zinc-950` (page/shell), `bg-zinc-900` (panels, drawers, popovers)
- **Text**: white with opacity — `text-white/60` (primary), `text-white/45` (secondary), `text-white/28` (muted), `text-white/18` (very muted)
- **Borders**: `border-white/[0.07]` (main dividers), `border-white/[0.06]` (section dividers), `border-white/[0.05]` (subtle)
- **Accent**: indigo — `bg-indigo-600/30` (icon bg), `text-indigo-300/80` (icon), `text-indigo-400/70` (active indicator), `border-indigo-500/25 bg-indigo-500/10` (badge/chip)
- **Interactive surfaces**: `hover:bg-white/[0.04]` to `hover:bg-white/[0.06]` on hover

### Typography
- Sizes: `text-[9px]` (overline/badge), `text-[10px]` (label/nav), `text-[11px]` (body-sm), `text-xs`/`text-sm` for content
- Use `uppercase tracking-widest font-bold` for section labels and overlines
- Use `tracking-tight` for truncated content

### Spacing & Layout
- Standard gap: `gap-1.5` (tight), `gap-2.5` (default)
- Standard padding: `px-2.5` (compact), `px-4` (panel), `py-1.5` (row items)
- Interactive rows: `h-6` (xs), `h-8` (sm), `h-9`/`h-10`/`h-11` (header bars)

### Rules
- Never use `neutral-*` colors — use `zinc-*` or `white/opacity` instead
- The app supports light AND dark themes via CSS token override (`globals.css` `html.light {}`). Do NOT add `dark:` prefixes to existing classes — the token system handles theming automatically. For new classes needing light-mode variants, use `[html.light_&]:` (e.g. `[html.light_&]:text-black/50`).
- Never use raw hex or `rgb()` values in className — use Tailwind utilities only
- Prefer `white/[0.xx]` fractional opacity for fine-grained control over borders and text. In light mode, `text-white/60` resolves to dark text at 60% opacity via `--color-white: #09090b`.
- For SVG attributes (`stroke`, `fill`), use `currentColor` instead of hardcoded `"white"` so they follow the CSS color token.
