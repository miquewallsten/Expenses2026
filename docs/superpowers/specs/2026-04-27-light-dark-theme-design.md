# Light/Dark Theme Toggle — Design Spec

**Date:** 2026-04-27
**Branch:** feature/phase-1-channels
**Status:** Approved, ready for implementation

---

## Overview

Add a light/dark/system theme toggle to OpsFlow. The light theme mirrors the dark theme's Cool Professional zinc palette — it is not a separate visual identity but the exact chromatic inverse of the existing dark system.

**Approach chosen:** CSS Token Override + Targeted Component Tuning. Tailwind v4 compiles all color utilities through CSS custom properties, so overriding `--color-zinc-*` and `--color-white` inside `html.light {}` propagates automatically to all 59+ component files with zero changes to those files. A small set of 6 components receive targeted tuning for cases the token swap cannot handle automatically.

---

## Architecture

### 1. CSS Token Block (`web/app/globals.css`)

A single `html.light { }` block overrides Tailwind v4's `--color-zinc-*` and `--color-white` custom properties. All utility classes resolve through these tokens at runtime.

Also add:
- `html { transition: background-color 200ms, color 200ms; }` for smooth cross-fade between themes
- A `html.light body { background-color: #fafafa; color: #09090b; }` rule to override the hardcoded values on `html, body`

### 2. ThemeProvider (`web/components/shell/ThemeProvider.tsx`)

New `"use client"` component. Responsibilities:
- Reads `pref_theme` from localStorage on mount (`"dark"` | `"light"` | `"system"`)
- Applies `light` or `dark` class to `document.documentElement`
- In `"system"` mode, attaches a `matchMedia("(prefers-color-scheme: dark)")` listener and follows OS preference live
- Removes the hardcoded `dark` class from `layout.tsx` — ThemeProvider owns the class from now on

Placement: wraps `{children}` inside `<body>` in `web/app/layout.tsx`. To prevent flash-of-wrong-theme, ThemeProvider also injects a blocking `<script>` tag that reads localStorage and sets the `light`/`dark` class synchronously before React hydrates.

### 3. SettingsModal Wiring

The existing `<select>` in Settings → Appearance already writes to localStorage and calls `classList` toggle. Changes:
- Make theme apply **instantly on change** (no Save click required for theme; rest of form still uses Save)
- Upgrade the `<select>` to a **3-button segmented control** (Dark / Light / System) with the active button highlighted in indigo
- Remove the stale `classList.remove("light","dark")` + `classList.add(theme)` logic from `handleSave` — ThemeProvider owns class management
- ThemeProvider exposes a React context with a `setTheme(value: "dark" | "light" | "system")` function. SettingsModal calls `setTheme()` directly — no storage event needed (the `storage` event only fires in other tabs, not the same tab)

### 4. `layout.tsx` Updates

- Remove `dark` from the hardcoded `className` on `<html>`
- Wrap `{children}` with `<ThemeProvider>`
- Make `viewport.themeColor` dynamic: ThemeProvider sets a `<meta name="theme-color">` tag — `#fafafa` in light, `#09090b` in dark

---

## Light-Mode Color Palette

The zinc scale inverts. Indigo accent stays unchanged.

| Token | Dark value | Light value | Role |
|---|---|---|---|
| `--color-zinc-950` | `#09090b` | `#fafafa` | Page background |
| `--color-zinc-900` | `#18181b` | `#f4f4f5` | NavRail, TopBar, card chrome |
| `--color-zinc-800` | `#27272a` | `#e4e4e7` | Primary borders, dividers |
| `--color-zinc-700` | `#3f3f46` | `#d4d4d8` | Secondary borders |
| `--color-zinc-600` | `#52525b` | `#a1a1aa` | Muted text |
| `--color-white` | `#ffffff` | `#09090b` | All `text-white/X` → dark text at X% opacity; all `border-white/X` → subtle dark borders |

**Indigo accent palette:** unchanged. `indigo-400`, `indigo-500`, `indigo-600` are legible on both themes. Existing active-state highlights (`bg-indigo-600/[0.18]`, `text-indigo-200`) require no modification.

---

## Component Tuning (6 files)

These components have cases the automatic token swap cannot fully resolve — hardcoded color strings, inline `bg-white/[0.04]` patterns that invert incorrectly, or gradient declarations.

### `web/components/shell/NavRail.tsx`
- **Problem:** Inactive badge `bg-white/[0.04]` becomes near-invisible on light zinc surface
- **Fix:** Add `html.light` CSS rule: inactive badge → `bg-black/[0.06]`; inactive text → `text-black/45`; hover states use `hover:bg-black/[0.04]`

### `web/components/shell/TopBar.tsx`
- **Problem:** Search input `bg-white/[0.04]` is invisible on light; header gradient `from-zinc-900 to-zinc-950` needs light equivalent
- **Fix:** Light mode header gradient → `from-zinc-100 to-zinc-50`; search input → `bg-black/[0.04]` with matching focus ring

### `web/components/shell/AppShell.tsx`
- **Problem:** Mobile nav overlay backdrop `bg-zinc-950/80` needs to become `bg-zinc-900/80` in light (token swap handles this automatically, but the tablet AI panel has hardcoded dark overlay colors)
- **Fix:** Tablet AI overlay panel uses explicit `dark:` / light-mode class variants

### `web/components/shell/SettingsModal.tsx`
- **Problem:** `selectCls` has `bg-zinc-900 text-white` as an inline string; modal panel `bg-zinc-950` handled by token swap but form inputs need explicit light styles
- **Fix:** Update `selectCls`, `inputCls`, `labelCls` to include light-mode overrides; form inputs → `bg-white border-zinc-200 text-zinc-900` in light

### `web/app/login/page.tsx`
- **Problem:** Grid SVG has `stroke="white"` hardcoded; card backdrop `bg-zinc-900/80` handled by token swap; glow blobs fine as-is
- **Fix:** SVG `stroke="white"` → `stroke="currentColor"` with light-mode text color override

### `web/app/globals.css` (`html, body` block)
- **Problem:** `background-color: #09090b` and `color: #fafafa` are hardcoded on `html, body`
- **Fix:** Add `html.light, html.light body { background-color: #fafafa; color: #09090b; }`

---

## Toggle UX

- **Location:** Settings → Appearance only (no TopBar quick-toggle)
- **Control:** 3-button segmented control replacing the existing `<select>` — Dark / Light / System
- **Apply behavior:** Instant — theme changes the moment a button is clicked, no Save needed
- **System mode:** Follows `prefers-color-scheme` live (no reload on OS switch)
- **Persistence:** localStorage key `pref_theme`, read by ThemeProvider before first paint
- **Transition:** 200ms `transition-colors` on `html` for smooth cross-fade

---

## Files to Create or Modify

| File | Action |
|---|---|
| `web/app/globals.css` | Add `html.light {}` token block, transition rule, `html,body` light override |
| `web/app/layout.tsx` | Remove hardcoded `dark` class, add `<ThemeProvider>`, dynamic theme-color meta |
| `web/components/shell/ThemeProvider.tsx` | **Create** — client component, manages `html` class from localStorage + matchMedia |
| `web/components/shell/SettingsModal.tsx` | Instant theme apply, segmented control UI, defer class management to ThemeProvider |
| `web/components/shell/NavRail.tsx` | Light-mode badge and text color tuning |
| `web/components/shell/TopBar.tsx` | Light-mode search input and header gradient |
| `web/components/shell/AppShell.tsx` | Light-mode overlay panel |
| `web/app/login/page.tsx` | SVG stroke fix |
| `web/messages/es.json` + `en.json` | Any new i18n keys for segmented control (labels likely already exist) |

---

## Out of Scope

- Adding `dark:` prefixes to any existing Tailwind classes
- Migrating to semantic design tokens
- Theming third-party components (none used)
- Per-page theme overrides

---

## Success Criteria

1. Switching to Light in Settings instantly applies the theme with no flash or reload
2. Light theme uses the Cool Professional zinc palette — `#fafafa` background, `#f4f4f5` panels, `#09090b` text
3. All 59+ component files are unmodified (except the 6 listed above)
4. System mode follows OS preference live
5. Theme persists across page reloads and browser restarts
6. The light and dark themes are visually equal in quality — same contrast ratios, same spatial hierarchy
