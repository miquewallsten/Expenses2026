# Light/Dark Theme Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a light/dark/system theme toggle to OpsFlow with a Cool Professional light palette, zero changes to the 59+ non-shell component files, and instant apply from Settings → Appearance.

**Architecture:** Tailwind v4 stores every color as a CSS custom property (`--color-zinc-950`, `--color-white`, etc.). Overriding those properties inside `html.light {}` in globals.css propagates automatically to every component without touching them. A ThemeProvider owns the `html` class and exposes a React context so SettingsModal can call `setTheme()` directly. Six shell-layer files receive targeted light-mode tuning for cases the token swap can't handle automatically.

**Tech Stack:** Next.js 16 App Router, Tailwind v4, `next-intl`, vitest + @testing-library/react

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `web/app/globals.css` | Modify | CSS token overrides, skeleton shimmer fix, transition |
| `web/app/layout.tsx` | Modify | Blocking inline script (FODT), ThemeProvider wrapper, remove hardcoded `dark` class |
| `web/components/shell/ThemeProvider.tsx` | **Create** | Theme context, localStorage sync, matchMedia system-mode listener, `<meta name="theme-color">` update |
| `web/components/shell/SettingsModal.tsx` | Modify | Consume ThemeContext, segmented control UI, instant apply |
| `web/components/shell/NavRail.tsx` | Modify | Light-mode badge + text tuning |
| `web/components/shell/TopBar.tsx` | Modify | Light-mode search input + header gradient |
| `web/app/login/page.tsx` | Modify | SVG `stroke="white"` → `stroke="currentColor"` |
| `web/CLAUDE.md` | Modify | Update design-system rules to reflect dual-theme |
| `web/__tests__/theme-provider.test.tsx` | **Create** | Unit tests for ThemeProvider |

---

## Task 1: CSS Token Override in globals.css

**Files:**
- Modify: `web/app/globals.css`

- [ ] **Step 1: Add the light-mode token block and html transition rule**

Open `web/app/globals.css`. After the closing `}` of the `:root {}` block (line 20), add the following two blocks:

```css
/* ── Theme transition ─────────────────────────────────────────────────────── */

html {
  transition: background-color 200ms ease, color 200ms ease;
}

/* ── Light-mode token overrides ──────────────────────────────────────────── */
/*
 * Tailwind v4 compiles every color utility through CSS custom properties.
 * Overriding these inside html.light propagates automatically to all
 * components that use bg-zinc-950, text-white/60, border-white/[0.07], etc.
 * — no component files need to change.
 *
 * Mapping: zinc scale inverts.  --color-white flips to near-black so that
 * text-white/X and border-white/X become dark text/borders at X% opacity.
 * Indigo accent stays unchanged — it reads well on both themes.
 */
html.light {
  --color-zinc-950: #fafafa;
  --color-zinc-900: #f4f4f5;
  --color-zinc-800: #e4e4e7;
  --color-zinc-700: #d4d4d8;
  --color-zinc-600: #a1a1aa;
  --color-white:    #09090b;
}

html.light,
html.light body {
  background-color: #fafafa;
  color: #09090b;
}
```

- [ ] **Step 2: Fix the skeleton shimmer for light mode**

The existing `.skeleton` uses hardcoded `rgba(255,255,255,...)` which is invisible on a light background. Add the light-mode override immediately after the existing `.skeleton` block:

```css
html.light .skeleton {
  background: linear-gradient(
    90deg,
    rgba(0, 0, 0, 0.04) 25%,
    rgba(0, 0, 0, 0.08) 50%,
    rgba(0, 0, 0, 0.04) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.6s ease-in-out infinite;
}
```

- [ ] **Step 3: Verify the CSS file is valid**

```bash
cd web && npx postcss app/globals.css --no-map 2>&1 | head -20
```

Expected: no errors printed (exit 0). If postcss is not available, just open the file and confirm the braces are balanced.

- [ ] **Step 4: Commit**

```bash
git add web/app/globals.css
git commit -m "feat(theme): add light-mode CSS token overrides to globals.css"
```

---

## Task 2: Create ThemeProvider

**Files:**
- Create: `web/components/shell/ThemeProvider.tsx`
- Create: `web/__tests__/theme-provider.test.tsx`

- [ ] **Step 1: Write the failing tests first**

Create `web/__tests__/theme-provider.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../components/shell/ThemeProvider";

// Capture the matchMedia mock so tests can trigger changes
let mqListeners: ((e: Partial<MediaQueryListEvent>) => void)[] = [];
const mockMq = {
  matches: false,
  addEventListener: vi.fn((_: string, fn: (e: Partial<MediaQueryListEvent>) => void) => {
    mqListeners.push(fn);
  }),
  removeEventListener: vi.fn((_: string, fn: (e: Partial<MediaQueryListEvent>) => void) => {
    mqListeners = mqListeners.filter((l) => l !== fn);
  }),
};

beforeEach(() => {
  mqListeners = [];
  mockMq.matches = false;
  vi.stubGlobal("matchMedia", () => mockMq);
  localStorage.clear();
  document.documentElement.classList.remove("dark", "light");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Consumer() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={() => setTheme("light")}>switch-light</button>
      <button onClick={() => setTheme("system")}>switch-system</button>
    </div>
  );
}

describe("ThemeProvider", () => {
  it("defaults to dark when localStorage is empty", () => {
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("reads pref_theme from localStorage on mount", () => {
    localStorage.setItem("pref_theme", "light");
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("setTheme writes to localStorage and updates the class", async () => {
    const { getByText } = render(<ThemeProvider><Consumer /></ThemeProvider>);
    await act(async () => { getByText("switch-light").click(); });
    expect(localStorage.getItem("pref_theme")).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("system mode uses OS preference (dark)", async () => {
    mockMq.matches = true; // OS is dark
    const { getByText } = render(<ThemeProvider><Consumer /></ThemeProvider>);
    await act(async () => { getByText("switch-system").click(); });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("system mode uses OS preference (light)", async () => {
    mockMq.matches = false; // OS is light
    const { getByText } = render(<ThemeProvider><Consumer /></ThemeProvider>);
    await act(async () => { getByText("switch-system").click(); });
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("system mode re-applies on OS change", async () => {
    mockMq.matches = false;
    const { getByText } = render(<ThemeProvider><Consumer /></ThemeProvider>);
    await act(async () => { getByText("switch-system").click(); });
    expect(document.documentElement.classList.contains("light")).toBe(true);
    // OS switches to dark
    await act(async () => {
      mqListeners.forEach((fn) => fn({ matches: true } as Partial<MediaQueryListEvent>));
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd web && npx vitest run __tests__/theme-provider.test.tsx 2>&1 | tail -20
```

Expected: FAIL — `ThemeProvider` and `useTheme` not found.

- [ ] **Step 3: Create ThemeProvider.tsx**

Create `web/components/shell/ThemeProvider.tsx`:

```tsx
"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "dark" | "light" | "system";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

function resolveClass(theme: Theme, systemDark: boolean): "dark" | "light" {
  if (theme === "system") return systemDark ? "dark" : "light";
  return theme;
}

function applyThemeClass(cls: "dark" | "light") {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(cls);
  const metaTag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (metaTag) metaTag.content = cls === "dark" ? "#09090b" : "#fafafa";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem("pref_theme") ?? "dark") as Theme;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    setThemeState(stored);
    applyThemeClass(resolveClass(stored, mq.matches));

    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    applyThemeClass(resolveClass(theme, systemDark));
  }, [theme, systemDark]);

  const setTheme = (next: Theme) => {
    localStorage.setItem("pref_theme", next);
    setThemeState(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

- [ ] **Step 4: Run tests — expect all 6 to pass**

```bash
cd web && npx vitest run __tests__/theme-provider.test.tsx 2>&1 | tail -20
```

Expected: `Tests 6 passed (6)`.

- [ ] **Step 5: Commit**

```bash
git add web/components/shell/ThemeProvider.tsx web/__tests__/theme-provider.test.tsx
git commit -m "feat(theme): add ThemeProvider with context, localStorage, and matchMedia"
```

---

## Task 3: Wire ThemeProvider into layout.tsx

**Files:**
- Modify: `web/app/layout.tsx`

- [ ] **Step 1: Add ThemeProvider import and blocking inline script**

Open `web/app/layout.tsx`. Make these two changes:

**a) Add import at the top** (after the existing imports):

```tsx
import { ThemeProvider } from "@/components/shell/ThemeProvider";
```

**b) Replace the `<html>` opening and entire body** — find the `export default function RootLayout` return and replace it with:

```tsx
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      {/* Blocking script: reads pref_theme from localStorage before React hydrates
          to prevent flash-of-wrong-theme on page load. */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('pref_theme')||'dark';var s=window.matchMedia('(prefers-color-scheme:dark)').matches;var c=t==='system'?(s?'dark':'light'):t;document.documentElement.classList.remove('dark','light');document.documentElement.classList.add(c);}catch(e){}})()`,
          }}
        />
      </head>
      <body className="h-full overflow-hidden bg-zinc-950 text-white">
        <ThemeProvider>
          <ErrorBoundary>
            <LocaleProvider>
              <ToastProvider>{children}</ToastProvider>
              <CopilotLauncher />
              <PwaBootstrap />
            </LocaleProvider>
          </ErrorBoundary>
          <DevLoginCheat />
        </ThemeProvider>
      </body>
    </html>
  );
```

Note: `dark` is removed from `className` on `<html>`. ThemeProvider now owns the `dark`/`light` class.

- [ ] **Step 2: Remove the static themeColor from viewport export**

Find the `viewport` export and remove `themeColor`:

```tsx
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  viewportFit: "cover",
};
```

(ThemeProvider updates `<meta name="theme-color">` dynamically via `applyThemeClass`.)

- [ ] **Step 3: Start dev server and verify no flash of light/wrong theme**

```bash
cd web && npm run dev
```

Open `http://localhost:3001`. The page should load dark (default). Open DevTools → Application → localStorage, set `pref_theme` to `light`, refresh — page should load light immediately with no dark flash.

- [ ] **Step 4: Commit**

```bash
git add web/app/layout.tsx
git commit -m "feat(theme): wire ThemeProvider into layout, add FODT blocking script"
```

---

## Task 4: SettingsModal — Segmented Control + Instant Apply

**Files:**
- Modify: `web/components/shell/SettingsModal.tsx`

- [ ] **Step 1: Add the useTheme import**

At the top of `web/components/shell/SettingsModal.tsx`, add:

```tsx
import { useTheme, type Theme } from "@/components/shell/ThemeProvider";
```

- [ ] **Step 2: Update SettingsDetail to consume the context and apply instantly**

In the `SettingsDetail` function (line 194), make these changes:

**a) Add the hook call** after the existing `useState` declarations:

```tsx
const themeCtx = useTheme();
```

**b) Replace the existing `theme` state and its `useEffect` sync** — find:

```tsx
const [theme, setTheme]                 = useState("dark");
```

and the useEffect that reads `pref_theme`, and replace the setTheme call inside that useEffect. The new local state mirrors the context:

```tsx
const [theme, setLocalTheme] = useState<Theme>(() =>
  (typeof window !== "undefined" ? localStorage.getItem("pref_theme") ?? "dark" : "dark") as Theme
);
```

**c) Add an instant-apply handler** that calls the context:

```tsx
const handleThemeChange = (next: Theme) => {
  setLocalTheme(next);
  themeCtx.setTheme(next);
};
```

**d) Remove the theme lines from `handleSave`** — find in `handleSave`:

```tsx
localStorage.setItem("pref_theme", theme);
const root = document.documentElement;
root.classList.remove("light", "dark");
if (theme !== "system") root.classList.add(theme);
```

Remove those 4 lines entirely. `handleSave` no longer manages theme — ThemeProvider does.

**e) Remove theme from `handleReset`** — find `setTheme("dark");` in `handleReset` and change to `handleThemeChange("dark");`.

- [ ] **Step 3: Replace the `<select>` with a segmented control**

Find the appearance section (around line 260):

```tsx
{sectionKey === "appearance" && (
  <div>
    <label className={labelCls}>{t("theme")}</label>
    <select value={theme} onChange={(e) => setTheme(e.target.value)} className={selectCls}>
      <option value="dark">{t("themeOptions.dark")}</option>
      <option value="light">{t("themeOptions.light")}</option>
      <option value="system">{t("themeOptions.system")}</option>
    </select>
  </div>
)}
```

Replace it with:

```tsx
{sectionKey === "appearance" && (
  <div>
    <label className={labelCls}>{t("theme")}</label>
    <div className="flex gap-1 rounded border border-white/[0.08] bg-black/[0.15] p-1">
      {(["dark", "light", "system"] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => handleThemeChange(opt)}
          className={`flex-1 rounded px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
            theme === opt
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-white/40 hover:text-white/70"
          }`}
        >
          {t(`themeOptions.${opt}` as Parameters<typeof t>[0])}
        </button>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify in browser**

Open Settings → Appearance. Click Light — the entire app should immediately switch to a light zinc palette. Click Dark — should switch back. Click System — should follow OS.

- [ ] **Step 5: Commit**

```bash
git add web/components/shell/SettingsModal.tsx
git commit -m "feat(theme): segmented control in Settings with instant theme apply"
```

---

## Task 5: NavRail Light-Mode Tuning

**Files:**
- Modify: `web/components/shell/NavRail.tsx`

The problem: `bg-white/[0.04]` on inactive badges becomes near-invisible on `#f4f4f5` (4% of #09090b over a near-white surface). Also `text-white/45` inactive items and `hover:bg-white/[0.04]` hover states need visible contrast in light mode.

- [ ] **Step 1: Locate the inactive nav item classes**

In `web/components/shell/NavRail.tsx`, find the `<Link>` className around line 146:

```tsx
item.active
  ? "bg-indigo-600/[0.18] text-white"
  : "text-white/45 hover:bg-white/[0.04] hover:text-white/70"
```

In Tailwind v4, use the `[html.light_&]:` arbitrary-variant escape-hatch to scope classes to light mode without touching the CSS file. Replace the `<Link>` className for the inactive branch:

```tsx
item.active
  ? "bg-indigo-600/[0.18] text-white"
  : "text-white/45 hover:bg-white/[0.04] hover:text-white/70 [html.light_&]:text-black/50 [html.light_&]:hover:bg-black/[0.05] [html.light_&]:hover:text-black/70"
```

- [ ] **Step 2: Fix the inactive badge span**

Find the badge `<span>` around line 158:

```tsx
item.active
  ? "bg-indigo-500/25 text-indigo-200"
  : "bg-white/[0.04] text-white/30 group-hover:bg-white/[0.07] group-hover:text-white/50"
```

Replace the inactive branch with:

```tsx
item.active
  ? "bg-indigo-500/25 text-indigo-200"
  : "bg-white/[0.04] text-white/30 group-hover:bg-white/[0.07] group-hover:text-white/50 [html.light_&]:bg-black/[0.06] [html.light_&]:text-black/35 [html.light_&]:group-hover:bg-black/[0.09] [html.light_&]:group-hover:text-black/55"
```

- [ ] **Step 3: Fix the group header button (group label + chevron)**

Find the group label `<button>` around line 123. The `text-white/30` chevron and label text need light-mode contrast. Find:

```tsx
<ChevronDown
  className={`h-2.5 w-2.5 shrink-0 text-white/30 transition-transform ${...}`}
/>
<span className="truncate text-[9px] font-bold uppercase tracking-widest text-white/30">
```

Add `[html.light_&]:text-black/35` to both:

```tsx
<ChevronDown
  className={`h-2.5 w-2.5 shrink-0 text-white/30 [html.light_&]:text-black/35 transition-transform ${...}`}
/>
<span className="truncate text-[9px] font-bold uppercase tracking-widest text-white/30 [html.light_&]:text-black/35">
```

- [ ] **Step 4: Fix the Help link at the bottom**

Find the Help `<Link>` around line 189:

```tsx
className={`flex items-center gap-2.5 rounded text-[11px] font-medium text-white/35 transition-colors hover:bg-white/[0.04] hover:text-white/60 ...`}
```

Add light variants:

```tsx
className={`flex items-center gap-2.5 rounded text-[11px] font-medium text-white/35 transition-colors hover:bg-white/[0.04] hover:text-white/60 [html.light_&]:text-black/40 [html.light_&]:hover:bg-black/[0.05] [html.light_&]:hover:text-black/65 ...`}
```

- [ ] **Step 5: Fix the NavRail header bar toggle button**

Find the toggle button around line 101:

```tsx
className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/22 transition-colors hover:bg-white/[0.05] hover:text-white/50"
```

Add:

```tsx
className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/22 transition-colors hover:bg-white/[0.05] hover:text-white/50 [html.light_&]:text-black/28 [html.light_&]:hover:bg-black/[0.05] [html.light_&]:hover:text-black/55"
```

- [ ] **Step 6: Verify visually**

In the browser at `http://localhost:3001`, switch to Light mode. NavRail should show legible nav items with visible badge chips and hover states.

- [ ] **Step 7: Commit**

```bash
git add web/components/shell/NavRail.tsx
git commit -m "feat(theme): NavRail light-mode badge and text tuning"
```

---

## Task 6: TopBar Light-Mode Tuning

**Files:**
- Modify: `web/components/shell/TopBar.tsx`

- [ ] **Step 1: Fix the header gradient**

In `web/components/shell/TopBar.tsx`, find the `<header>` element (line 39):

```tsx
className="relative flex h-11 shrink-0 items-stretch border-b border-white/[0.07] bg-gradient-to-b from-zinc-900 to-zinc-950 md:h-9"
```

The token swap handles `from-zinc-900 to-zinc-950` automatically (they resolve to light zinc values). However the border `border-white/[0.07]` also resolves through `--color-white` → becomes `rgba(9,9,11,0.07)` which is a subtle dark border. This is correct. No change needed here — token swap handles it.

- [ ] **Step 2: Fix the search input**

Find the search `<input>` around line 76:

```tsx
className="h-[30px] w-full rounded border border-white/[0.09] bg-white/[0.04] pl-7 pr-3 text-[11px] text-white/70 placeholder-white/28 outline-none transition-all focus:border-indigo-500/40 focus:bg-indigo-950/15 focus:ring-1 focus:ring-indigo-500/15"
```

All of these resolve through `--color-white` so the token swap covers it. `bg-white/[0.04]` → `rgba(9,9,11,0.04)` = slight dark tint on light surface, which is correct. `text-white/70` → `rgba(9,9,11,0.7)` = readable dark text. The search input needs no manual changes.

- [ ] **Step 3: Fix the Search icon color**

Find the `<Search>` icon around line 74:

```tsx
<Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/20" />
```

`text-white/20` → `rgba(9,9,11,0.2)` via token swap = subtle dark icon. Correct, no change needed.

- [ ] **Step 4: Fix the icon buttons (Settings, LogOut, AI)**

The icon buttons use `text-white/28` and `hover:text-white/55` — all handled by token swap. However, check the `<div>` section label:

```tsx
<span className="truncate text-[10px] font-bold uppercase tracking-widest text-white/60">
  {title}
</span>
```

`text-white/60` → `rgba(9,9,11,0.6)` via token swap = dark readable label. Correct.

- [ ] **Step 5: Fix the role badge**

Find the role badge around line 134:

```tsx
<span className="rounded border border-indigo-500/25 bg-indigo-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-indigo-300/65">
```

`text-indigo-300/65` — this is indigo, not white. Indigo stays the same in our token override. In light mode, `indigo-300` at 65% opacity on a light background might be too light. Fix by adding a light-mode variant:

```tsx
<span className="rounded border border-indigo-500/25 bg-indigo-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-indigo-300/65 [html.light_&]:text-indigo-700/80 [html.light_&]:bg-indigo-100 [html.light_&]:border-indigo-300/50">
```

- [ ] **Step 6: Fix the Super Admin link**

Find the Super Admin link around line 121:

```tsx
className="hidden items-center gap-1.5 border-r border-white/[0.05] px-3 text-rose-300/70 transition-colors hover:bg-rose-500/[0.08] hover:text-rose-200 md:flex"
```

`text-rose-300/70` is too light on a white background. Add light variant:

```tsx
className="hidden items-center gap-1.5 border-r border-white/[0.05] px-3 text-rose-300/70 [html.light_&]:text-rose-600/80 transition-colors hover:bg-rose-500/[0.08] hover:text-rose-200 [html.light_&]:hover:text-rose-700 md:flex"
```

- [ ] **Step 7: Verify visually in light mode**

Switch to Light in Settings. The TopBar should show legible labels, a readable search input, and proper icon button colors.

- [ ] **Step 8: Commit**

```bash
git add web/components/shell/TopBar.tsx
git commit -m "feat(theme): TopBar light-mode role badge and super-admin link tuning"
```

---

## Task 7: Login Page SVG Fix

**Files:**
- Modify: `web/app/login/page.tsx`

- [ ] **Step 1: Fix the hardcoded SVG stroke color**

In `web/app/login/page.tsx`, find the SVG grid (around line 51):

```tsx
<path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.5" />
```

`stroke="white"` is a hardcoded SVG attribute — it does NOT go through Tailwind CSS custom properties, so it stays white in light mode regardless of the token override.

Replace with:

```tsx
<path d="M 48 0 L 0 0 0 48" fill="none" stroke="currentColor" strokeWidth="0.5" />
```

`currentColor` inherits from the CSS `color` property. In dark mode, `color: #fafafa` → white stroke. In light mode, `color: #09090b` → near-black stroke. Both at 2.5% opacity from the SVG's `opacity-[0.025]` class.

- [ ] **Step 2: Verify visually**

Open `http://localhost:3001/login` in light mode. The grid lines should appear as subtle dark lines on the light background (very faint, matching the existing 2.5% opacity). The indigo glow blobs remain correct.

- [ ] **Step 3: Commit**

```bash
git add web/app/login/page.tsx
git commit -m "fix(theme): login page SVG stroke currentColor for light mode"
```

---

## Task 8: Update web/CLAUDE.md Design Rules

**Files:**
- Modify: `web/CLAUDE.md`

- [ ] **Step 1: Update the dark-only rules to reflect dual-theme**

In `web/CLAUDE.md`, find the Rules section:

```markdown
### Rules
- Never use `neutral-*` colors — use `zinc-*` or `white/opacity` instead
- Never use `light:` or remove `dark:` — the app is dark-only; no light mode
- Never use raw hex or `rgb()` values in className — use Tailwind utilities only
- Prefer `white/[0.xx]` fractional opacity for fine-grained control over borders and text
```

Replace with:

```markdown
### Rules
- Never use `neutral-*` colors — use `zinc-*` or `white/opacity` instead
- The app now supports light AND dark themes via CSS token override (see `globals.css`). Do NOT add `dark:` prefixes to existing classes — the token system handles theming automatically. When adding NEW classes that need light-mode variants, use the `[html.light_&]:` escape-hatch in Tailwind v4 (e.g. `[html.light_&]:text-black/50`).
- Never use raw hex or `rgb()` values in className — use Tailwind utilities only
- Prefer `white/[0.xx]` fractional opacity for fine-grained control over borders and text. In light mode these resolve through `--color-white: #09090b`, so `text-white/60` = dark text at 60% opacity.
- For SVG attributes (`stroke`, `fill`), use `currentColor` instead of hardcoded `"white"` so they follow the CSS color token.
```

- [ ] **Step 2: Commit**

```bash
git add web/CLAUDE.md
git commit -m "docs(theme): update design rules for dual-theme CSS token approach"
```

---

## Task 9: Full Test Suite + Visual Smoke Test

- [ ] **Step 1: Run the full frontend test suite**

```bash
cd web && npx vitest run 2>&1 | tail -30
```

Expected: all existing tests pass, plus 6 new ThemeProvider tests. No regressions.

- [ ] **Step 2: Visual smoke — dark mode**

In `http://localhost:3001` with `pref_theme: dark` in localStorage:
- [ ] NavRail: active item indigo highlight, inactive items white/45 text, readable badges
- [ ] TopBar: dark gradient header, visible search input, proper icon opacity
- [ ] Settings → Appearance: 3-button segmented control, Dark button indigo-highlighted
- [ ] Login page: dark background with white grid lines (2.5% opacity)

- [ ] **Step 3: Visual smoke — light mode**

Switch to Light in Settings:
- [ ] Page background: `#fafafa` (near-white)
- [ ] NavRail background: `#f4f4f5` (light zinc panel), badges visible with black/6 background
- [ ] TopBar: light zinc gradient, search input visible, role badge dark indigo
- [ ] Cards/panels: white with `#e4e4e7` borders
- [ ] Login page: light background with dark grid lines (2.5% opacity)
- [ ] Refresh the page — no flash of dark before light loads

- [ ] **Step 4: Visual smoke — system mode**

Switch to System in Settings. Change OS appearance (macOS: System Preferences → Appearance):
- [ ] App follows OS preference within ~100ms without a page reload

- [ ] **Step 5: Final commit if any cleanup needed, then tag the feature**

```bash
git log --oneline -8
```

Confirm all 8 feature commits are present. The branch is ready for PR.

---

## Self-Review Checklist (pre-submit)

- [ ] All 6 spec success criteria covered by tasks above
- [ ] No TBD or placeholder steps
- [ ] ThemeProvider `resolveClass` and `applyThemeClass` names used consistently across Tasks 2, 3, 4
- [ ] `[html.light_&]:` variant syntax used consistently (Tasks 5, 6) — not `dark:` prefixes
- [ ] No new i18n keys needed (dark/light/system labels already exist in both `es.json` and `en.json`)
- [ ] `handleSave` in SettingsModal no longer touches localStorage for theme or `classList` — ThemeProvider owns both
- [ ] `viewport.themeColor` removed from static export; `<meta name="theme-color">` managed by `applyThemeClass`
