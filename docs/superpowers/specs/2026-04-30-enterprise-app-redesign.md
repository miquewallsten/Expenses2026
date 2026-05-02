# Enterprise App Redesign — Direction C: Refinement + Motion

**Date:** 2026-04-30
**Scope:** Full visual and structural redesign of the financial-ops-platform frontend
**Target:** Enterprise SaaS platform handling thousands of users, single entry point (`/mywork`)
**Approach:** Structural redesign with Smart Command Center + adaptive admin onboarding wizard
**Visual Direction:** Precision minimal with layered depth, purposeful motion, and premium micro-interactions

---

## 1. Visual System

### 1.1 Surface Levels

Replace the existing 2-level hierarchy with 4 distinct surfaces. Every surface has a semantic purpose.

| Level | Hex (Dark) | CSS Variable | Purpose |
|-------|------------|--------------|---------|
| 0 — Canvas | `#050505` | `--surface-0` | App background. Nothing sits directly on this. |
| 1 — Panel | `#0A0A0A` | `--surface-1` | Sidebars, top bar, rails. Elevated from canvas. |
| 2 — Card | `#111112` | `--surface-2` | Cards, form sections, detail panels. The work surface. |
| 3 — Elevated | `#1A1A1C` | `--surface-3` | Hover states, active cards, dropdowns, modals. Subtle shadow. |

**Light mode mapping:**
| Level | Hex (Light) |
|-------|-------------|
| 0 | `#FFFFFF` |
| 1 | `#F2F2F7` |
| 2 | `#FFFFFF` |
| 3 | `#E5E5EA` |

**Shadows (elevation tokens):**
| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-1` | `0 1px 2px rgba(0,0,0,0.2)` | Hover lift on rows, buttons |
| `--shadow-2` | `0 2px 8px rgba(0,0,0,0.25)` | Active cards, dropdowns |
| `--shadow-3` | `0 4px 16px rgba(0,0,0,0.3)` | Modals, drawers |
| `--shadow-4` | `0 8px 32px rgba(0,0,0,0.4)` | Full-screen overlays |

### 1.2 Border System

Unify all borders to a 4-tier scale. Eliminate ad-hoc opacity values.

| Tier | Opacity | Width | Usage |
|------|---------|-------|-------|
| Hairline | `rgba(255,255,255,0.04)` | 0.5px | List item separators, subtle dividers |
| Subtle | `rgba(255,255,255,0.06)` | 1px | Card borders, section dividers, panel borders |
| Standard | `rgba(255,255,255,0.10)` | 1px | Input borders, focusable element borders |
| Active | `rgba(10,132,255,0.35)` | 1px | Active/selected state borders, focused inputs |

**Light mode:** invert white → black with same opacity values.

### 1.3 Typography Scale

Reduce all-caps density. Use weight and color contrast for hierarchy.

| Token | Size | Weight | Color | Case | Usage |
|-------|------|--------|-------|------|-------|
| `overline` | 9px | 500 | `white/25` | uppercase, tracking 0.06em | Section labels, metadata |
| `label` | 11px | 500 | `white/45` | sentence | Form labels, nav items |
| `body-sm` | 12px | 400 | `white/70` | sentence | Body text, descriptions |
| `body` | 13px | 400 | `white/75` | sentence | Primary content |
| `heading-sm` | 14px | 600 | `white/85` | sentence | Card titles, section headers |
| `heading` | 16px | 600 | `white/90` | sentence | Page titles, modal headers |
| `display` | 20px | 600 | `white/90` | sentence | Welcome titles, empty states |

**Font stack:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
**Mono stack:** `"SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, monospace`

### 1.4 Spacing System

4px base grid. Tighten by ~25% from current values.

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Tight internal gaps, icon margins |
| `space-2` | 8px | Button padding, inline form rows, list item padding |
| `space-3` | 12px | Card padding, panel padding, section gaps |
| `space-4` | 16px | Page padding, modal padding, onboarding steps |
| `space-5` | 24px | Empty states, onboarding welcome, major breaks |
| `space-6` | 32px | Section separators, hero spacing |

### 1.5 Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 4px | Badges, pills, status indicators |
| `radius-md` | 6px | Buttons, inputs, table rows, cards |
| `radius-lg` | 8px | Panels, modals, drawers, onboarding cards |
| `radius-xl` | 12px | Floating elements, toasts, tooltips |
| `radius-full` | 9999px | Avatars, circular buttons, toggles |

---

## 2. Component Redesign

### 2.1 Buttons

**Variants:** `primary`, `secondary`, `ghost`, `danger`
**Sizes:** `xs` (h-6), `sm` (h-7), `md` (h-8), `lg` (h-10)

**Primary:**
- Default: `bg-indigo-600/85 text-white border border-indigo-500/40 rounded-md`
- Hover: `bg-indigo-500/85`
- Active/Pressed: `scale-[0.97] bg-indigo-600/95` (80ms transition)
- Focus: `ring-2 ring-indigo-400/30 ring-offset-1 ring-offset-surface-2`
- Disabled: `opacity-40 cursor-not-allowed`

**Secondary:**
- Default: `bg-white/[0.04] text-white/75 border border-white/[0.08] rounded-md`
- Hover: `bg-white/[0.07] text-white/85 border-white/[0.12]`
- Active: `scale-[0.97] bg-white/[0.09]`
- Focus: same ring pattern

**Ghost:**
- Default: `bg-transparent text-white/55 border-transparent rounded-md`
- Hover: `bg-white/[0.04] text-white/70`
- Active: `scale-[0.97] bg-white/[0.06]`

**Danger:**
- Default: `bg-red-600/80 text-white border border-red-500/40 rounded-md`
- Hover: `bg-red-500/85`
- Active: `scale-[0.97] bg-red-600/95`

**Loading state:**
- Spinner: `h-3 w-3 animate-spin border-2 border-white/30 border-t-white`
- Opacity reduction on text while loading

### 2.2 Inputs & Form Fields

**Text Input:**
- Default: `h-8 px-2.5 bg-surface-0 border border-standard rounded-md text-xs text-white/85 placeholder:text-white/25`
- Hover: `border-white/[0.12]`
- Focus: `border-active bg-white/[0.03] shadow-[0_0_0_2px_rgba(10,132,255,0.1)]`
- Invalid: `border-red-500/50 focus:border-red-400/65`
- Disabled: `opacity-40 cursor-not-allowed bg-white/[0.02]`

**Label:**
- `text-label mb-1 block`
- Required indicator: `text-red-400/80 ml-0.5`

**Error text:**
- `text-[11px] text-red-400/70 mt-1`

**Textarea:**
- Same as input but `min-h-[80px] py-2 resize-y`

**Select:**
- Same visual as input
- Dropdown: `absolute mt-1 z-50 min-w-full rounded-lg border border-subtle bg-surface-2 shadow-2 py-1 max-h-60 overflow-auto`
- Option: `px-3 h-8 text-[11px] text-white/70 hover:bg-white/[0.04] cursor-pointer`
- Active option: `bg-indigo-500/10 text-indigo-300/90`

### 2.3 Tables

**Structure:**
- No card container. Flat rows on surface-0 or surface-1.
- Header: `text-overline border-b border-subtle bg-white/[0.02]`
- Row: `border-b border-hairline hover:bg-white/[0.02] transition-colors duration-100`
- Cell padding: `px-3 py-2`

**Hover actions:**
- Actions (edit, delete, etc.) are hidden by default
- On row hover: actions fade in with `opacity-0 → opacity-100` (150ms)
- Actions are inline, not in a dropdown

**Empty state:**
- `py-12 text-center` with icon + `text-heading-sm` + `text-body-sm text-white/35`

### 2.4 Status Pills

Replace colored-text-only badges with background-tinted pills.

| Status | Background | Border | Text |
|--------|------------|--------|------|
| Draft | `bg-white/[0.03]` | `border-white/[0.06]` | `text-white/50` |
| Pending | `bg-amber-500/[0.08]` | `border-amber-500/[0.15]` | `text-amber-400` |
| Review | `bg-violet-500/[0.08]` | `border-violet-500/[0.15]` | `text-violet-400` |
| Approved | `bg-emerald-500/[0.08]` | `border-emerald-500/[0.15]` | `text-emerald-400` |
| Rejected | `bg-red-500/[0.08]` | `border-red-500/[0.15]` | `text-red-400` |
| Uploading | `bg-indigo-500/[0.08]` | `border-indigo-500/[0.15]` | `text-indigo-400` |

**Pill shape:** `inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-medium`

### 2.5 Modal

- Backdrop: `fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in`
- Panel: `w-full mx-4 rounded-lg border border-subtle bg-surface-2 shadow-3 animate-scale-in`
- Sizes: `max-w-sm` (confirm), `max-w-md` (forms), `max-w-2xl` (complex)
- Header: `px-4 py-3 border-b border-subtle flex items-center justify-between`
- Title: `text-heading-sm`
- Body: `px-4 py-4`
- Footer: `px-4 py-3 border-t border-subtle flex justify-end gap-2`
- Entrance: `scale(0.96) → 1` + `opacity 0 → 1`, 200ms, ease-out-quart

### 2.6 Drawer

- Backdrop: same as modal
- Panel: `absolute top-0 bottom-0 bg-surface-2 border-subtle flex flex-col shadow-3 animate-slide-in-right`
- Default width: `w-96` (384px)
- Side: `right` (border-l) or `left` (border-r)
- Entrance: `translateX(100%) → 0`, 220ms, ease-out-quart

### 2.7 Toast

- Container: `fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm`
- Item: `rounded-lg border px-3 py-2.5 text-[11px] shadow-2 backdrop-blur-sm`
- Variants:
  - Info: `border-sky-500/30 bg-sky-500/10 text-sky-300`
  - Success: `border-emerald-500/30 bg-emerald-500/10 text-emerald-300`
  - Warning: `border-amber-500/30 bg-amber-500/10 text-amber-300`
  - Error: `border-red-500/30 bg-red-500/10 text-red-300`
- Entrance: `slide-in-right` 300ms
- Auto-dismiss: 4500ms with `opacity → 0` + `translateX(10px)` exit

### 2.8 Tooltip

- `absolute z-50 whitespace-nowrap rounded-md border border-subtle bg-surface-3 px-2.5 py-1 text-[10px] text-white/80 shadow-2`
- Entrance: `opacity 0 → 1` + `translateY(2px) → 0`, 120ms
- Arrow: 4px pseudo-element

### 2.9 Skeleton

- Background: `bg-white/[0.03]`
- Shimmer: `linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)`
- Duration: 1.6s ease-in-out infinite
- **Shape-aware:** skeleton blocks match the shape of actual content (text lines, avatar circles, card heights)

---

## 3. Motion System

### 3.1 Principles

1. **Purposeful** — every animation guides attention or confirms an action
2. **Fast** — most under 200ms, never over 300ms
3. **Smooth** — ease-out-quart for entrances, ease-out-quint for exits
4. **Subtle** — the user feels it more than they see it

### 3.2 Easing Tokens

| Token | Curve | Usage |
|-------|-------|-------|
| `ease-out-quart` | `cubic-bezier(0.25, 1, 0.5, 1)` | Primary entrances |
| `ease-out-quint` | `cubic-bezier(0.22, 1, 0.36, 1)` | Exits, dismissals |
| `ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Hover states, quick feedback |
| `ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | Shimmer, continuous |

### 3.3 Animation Tokens

| Token | Duration | Easing | Properties |
|-------|----------|--------|------------|
| `anim-fade` | 150ms | ease-out | opacity |
| `anim-slide-up` | 200ms | ease-out-quart | opacity, translateY(8px→0) |
| `anim-slide-down` | 200ms | ease-out-quart | opacity, translateY(-8px→0) |
| `anim-slide-left` | 220ms | ease-out-quart | opacity, translateX(20px→0) |
| `anim-slide-right` | 220ms | ease-out-quart | opacity, translateX(-20px→0) |
| `anim-scale-in` | 180ms | ease-out-quart | opacity, scale(0.96→1) |
| `anim-scale-out` | 150ms | ease-out-quint | opacity, scale(1→0.96) |

### 3.4 List Stagger

When a list loads or updates:
- Each row: `anim-slide-up` with incremental delay
- Delay: `index * 30ms`
- Max delay cap: 300ms (so lists of 20+ items don't feel slow)
- Only animate newly added items, not existing ones

### 3.5 Button Micro-interactions

- **Hover:** background color transition 150ms
- **Active/Press:** `transform: scale(0.97)` 80ms ease-out
- **Release:** `transform: scale(1)` 120ms ease-out-quart
- **Focus:** ring appears 150ms

### 3.6 Row Hover

- Background: `transparent → white/[0.02]` 100ms
- Border (if any): brighten by ~20% opacity
- Inline actions: `opacity 0 → 1` 150ms

### 3.7 Dropdown Menu

- Entire menu: `opacity 0→1` + `translateY(-4px)→0` 150ms ease-out-quart
- Items: stagger 20ms each
- Exit: reverse, 100ms

### 3.8 NavRail Expand/Collapse

- Width transition: `200ms ease-out-quart`
- Text labels: `opacity 0→1` with 50ms delay after width starts
- Icons: no animation (stay centered)

### 3.9 Resizer Handles

- Default: `2px wide, bg-white/[0.04]`
- Hover (within 4px): `bg-indigo-500/40` 100ms
- Dragging: `bg-indigo-500/70` instant
- Cursor: `col-resize` / `row-resize`

---

## 4. Shell Layout

### 4.1 Architecture

The app is a single entry point (`/mywork`) with dynamic module loading.

**Desktop layout:**
```
+----------------------------------------------------------+
| NavRail | Workspace | Resizer | Detail Pane | Copilot    |
| 56px    | flex-1    | 2px     | 280px       | 56px/240px |
+----------------------------------------------------------+
```

**Tablet layout:**
```
+------------------------------------------+
| NavRail | Workspace | Copilot           |
| 56px    | flex-1    | collapsed/240px     |
+------------------------------------------+
```

**Mobile layout:**
```
+------------------+
| Workspace (full) |
| drawers overlay  |
+------------------+
```

### 4.2 NavRail

**Collapsed (default):**
- Width: `56px`
- Background: `surface-1`
- Border-right: `border-subtle`
- Items: 32px icon buttons, centered, 4px gap
- Active item: `bg-indigo-500/[0.08] rounded-lg` with `text-indigo-300`
- Inactive item: `opacity-40 hover:opacity-70 hover:bg-white/[0.02] rounded-lg`

**Expanded (on hover):**
- Width: `200px`
- Transition: `width 200ms ease-out-quart`
- Item layout: icon (32px) + label (12px), 8px gap, left-aligned
- Group labels: `text-overline` with 12px top margin
- Auto-collapse: 400ms delay after mouse leaves

**Active indicator:**
- No left border bar. Use background tint + subtle border glow.
- `bg-indigo-500/[0.08] border border-indigo-500/[0.12] rounded-lg`

### 4.3 Workspace

- Background: `surface-0`
- Content: flat list with `border-hairline` separators
- No card wrapping for lists
- Page header: `text-heading` + optional subtitle `text-body-sm text-white/35`
- Toolbar (optional): `h-10 border-b border-subtle flex items-center gap-2 px-3`

### 4.4 Detail Pane

- Background: `surface-1`
- Border-left: `border-subtle`
- Width: `280px` default, min `240px`, max `440px`
- Resizable via 2px handle
- Empty state: centered icon + `text-body-sm text-white/30`
- Content padding: `space-3` (12px)

### 4.5 Copilot Rail

**Collapsed:**
- Width: `56px`
- Floating button: `w-10 h-10 rounded-full bg-indigo-600/20 border border-indigo-500/20`
- Position: bottom of rail

**Expanded:**
- Width: `280px` (resizable)
- Background: `surface-1`
- Border-left: `border-subtle`
- Header: `h-9 border-b border-subtle flex items-center px-3`
- Title: `text-label`
- Messages area: flex-1, scrollable
- Input: fixed bottom, `h-10 border-t border-subtle`

### 4.6 Top Bar

- Height: `h-9` (36px)
- Background: `surface-1`
- Border-bottom: `border-subtle`
- Left: module icon + `text-heading-sm`
- Center: search input (collapsible on mobile)
- Right: actions (notification, settings, user menu)

### 4.7 Resizer Handles

- Visible track: `2px wide, full height`
- Default color: `bg-white/[0.04]`
- Hover (4px proximity): `bg-indigo-500/40` 100ms
- Dragging: `bg-indigo-500/70`
- Grab area: `w-2 -ml-0.5` (extends 4px on each side)
- Double-click: reset to default width

---

## 5. Admin Onboarding Flow

### 5.1 Philosophy

No flat settings pages. The admin is guided through configuration like a conversation. Each answer unlocks the next relevant question. AI copilot is always available in the rail for context and suggestions.

### 5.2 Flow Overview

```
Welcome → Company Profile → Select Modules → Configure Each Module → Review → Done
```

### 5.3 Step 1: Welcome

**Layout:**
- Full workspace, centered content, max-width `480px`
- Background: subtle gradient `radial-gradient(ellipse at top, rgba(10,132,255,0.03), transparent)`

**Content:**
- Title: `text-display` — "Welcome, {firstName}"
- Subtitle: `text-body text-white/45` — "Let's configure your company's expense management system. This will take about 5 minutes."
- CTA: `Button primary lg` — "Start Setup"
- Secondary: `Button ghost` — "Skip for now ( configure later )"
- Footer: `text-overline` — "Or ask the AI Copilot for help →"

### 5.4 Step 2: Company Profile

**Layout:**
- Centered form, max-width `480px`
- Progress indicator at top: step dots (1 active, 2-5 inactive)

**Fields:**
- Company name (required)
- Currency (dropdown, default MXN)
- Timezone (dropdown, auto-detect)
- Tax ID / RFC (optional)
- Address (optional, expandable)

**Validation:**
- Inline, on blur
- Error: red border + error text below
- Next button disabled until required fields valid

**Progress indicator:**
```
[●]——[○]——[○]——[○]——[○]
 1     2     3     4     5
```
- Active: `w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold`
- Inactive: `w-6 h-6 rounded-full bg-white/[0.04] text-white/30 text-xs`
- Connector: `h-0.5 flex-1 bg-white/[0.06]`

### 5.5 Step 3: Select Modules

**Layout:**
- Grid: 2 columns on desktop, 1 on mobile
- Gap: `space-3` (12px)

**Module cards:**
- Default: `p-4 bg-surface-2 border border-subtle rounded-lg`
- Active: `bg-indigo-500/[0.05] border-indigo-500/[0.15]`
- Layout: checkbox (top-right) + icon + title + description
- Title: `text-heading-sm`
- Description: `text-body-sm text-white/35`

**Available modules:**
- Expenses (default on)
- Timesheets
- Requests (Purchases)
- Accounting
- AI & Automations

**AI Suggestion banner:**
- `p-3 bg-white/[0.02] border border-subtle rounded-lg mt-4`
- Icon: sparkle
- Text: "Based on your company size, we recommend starting with Expenses + Accounting."
- Action: "Apply suggestion" button

### 5.6 Step 4: Configure Each Module

**Layout:**
- One module at a time
- Question-based, not form-based
- Each question is a card with options

**Example — Approval Workflow:**

Question: "How are expenses approved in your company?"
Options (3-column on desktop, stacked on mobile):
- "Direct to finance" (1 stage)
- "Manager first, then finance" (2 stages)
- "Custom flow" (opens builder)

If "Manager first":
- Next question: "Can managers approve their own expenses?"
- Options: Yes / No

If "Custom flow":
- Opens inline stage builder
- Drag to reorder stages
- Each stage: name + role selector + limit (optional)

**Conditional branching:**
- Answers determine subsequent questions
- Skip irrelevant sections
- Show/hide fields based on previous answers

**Inline preview:**
- At bottom of each section: "Preview: Employee submits → Manager approves → Finance approves → Done"
- Visual flow diagram with arrows

### 5.7 Step 5: Review

**Layout:**
- Summary list, max-width `560px`
- Each section is a card with edit button

**Sections:**
- Company Profile (with edit link)
- Active Modules (with edit link)
- Approval Flow (with edit link)
- Policies (if configured)
- Users (if invited)

**Each summary item:**
- Header: `flex justify-between` with title + edit link
- Content: `text-body-sm text-white/60`
- Edit link: `text-indigo-400/80 hover:text-indigo-300` — opens that step inline

**Finish CTA:**
- `Button primary lg` — "Finish Setup"
- Secondary: "Save as draft" (continue later)

**Success state:**
- Full-screen checkmark animation
- Title: "You're all set!"
- Subtitle: "Your team can now start submitting expenses."
- CTA: "Go to Dashboard"

### 5.8 AI Copilot Integration

- Always available in right rail during onboarding
- Context-aware: knows which step the user is on
- Can answer questions like:
  - "What does approval workflow mean?"
  - "Should I enable timesheets?"
  - "What's the difference between manager and finance approval?"
- Can suggest defaults based on company profile
- Can auto-fill fields with suggestions (user must confirm)

---

## 6. Responsive Behavior

### 6.1 Breakpoints

| Name | Width | Layout |
|------|-------|--------|
| Mobile | < 768px | Single column, drawers, bottom sheets |
| Tablet | 768px – 1024px | NavRail + Workspace, Copilot collapsed |
| Desktop | > 1024px | Full 3-4 column layout |

### 6.2 Mobile Adaptations

- NavRail: bottom tab bar (icon-only, 5 items max, "More" overflow)
- Workspace: full width
- Detail pane: slide-up sheet (85% height)
- Copilot: bottom sheet (full screen)
- Tables: card list view instead of table
- Modals: full-screen sheets
- Onboarding: single column, stacked options

### 6.3 Touch Targets

- Minimum: `44px × 44px`
- Buttons: `h-10` minimum on mobile
- List items: `min-h-[48px]`
- Input height: `h-10` on mobile

---

## 7. Accessibility

### 7.1 Focus Management

- All interactive elements have visible focus states
- Focus ring: `ring-2 ring-indigo-400/40 ring-offset-1 ring-offset-surface-2`
- Trap focus in modals and drawers
- Return focus to trigger on close

### 7.2 Color Contrast

- All text meets WCAG AA (4.5:1) for normal text
- Large text (14px+ bold) meets 3:1
- Status pills have both color and text

### 7.3 Motion

- Respect `prefers-reduced-motion`
- If enabled: disable stagger, instant transitions, no scale transforms
- Keep opacity transitions only (fast)

### 7.4 Screen Readers

- All icons have `aria-label`
- Buttons have descriptive text
- Tables use proper `<thead>`, `<th scope="col">`
- Live regions for toast notifications
- Modal titles as `aria-labelledby`

---

## 8. Implementation Order

### Phase 1: Foundation (Week 1)
1. Update CSS variables in `globals.css` (surface levels, borders, shadows, spacing)
2. Create `design-tokens.ts` with typed token exports
3. Update `ThemeProvider` to support new surface variables
4. Verify light mode mappings

### Phase 2: Components (Week 1-2)
1. Redesign `Button.tsx` with press states and focus rings
2. Redesign `Input.tsx`, `Textarea.tsx`, `Select.tsx`
3. Redesign `Table.tsx` with flat rows and hover actions
4. Redesign `StatusBadge.tsx` with pill backgrounds
5. Redesign `Modal.tsx`, `Drawer.tsx` with new animations
6. Redesign `Toast.tsx` with new entrance/exit
7. Update `Skeleton.tsx` with shape-aware blocks

### Phase 3: Motion (Week 2)
1. Add animation keyframes to `globals.css`
2. Create `useStagger` hook for list animations
3. Add press states to all interactive elements
4. Update focus ring system
5. Add row hover lift effect

### Phase 4: Shell (Week 2-3)
1. Redesign `NavRail.tsx` with expand-on-hover
2. Update `AppShell.tsx` layout
3. Update `TopBar.tsx`
4. Update `DetailPane.tsx`
5. Update `CopilotRail.tsx`
6. Update resizer handles

### Phase 5: Admin Onboarding (Week 3-4)
1. Create onboarding wizard shell
2. Build Step 1: Welcome
3. Build Step 2: Company Profile
4. Build Step 3: Module Selection
5. Build Step 4: Adaptive Configuration
6. Build Step 5: Review & Done
7. Integrate AI Copilot context

### Phase 6: Polish (Week 4)
1. Responsive testing across breakpoints
2. Accessibility audit
3. Animation performance check (no layout thrashing)
4. Cross-browser testing
5. Light mode verification

---

## 9. Files to Touch

### Core
- `web/app/globals.css` — CSS variables, keyframes, base styles
- `web/lib/design-tokens.ts` — new file, typed token exports

### UI Primitives
- `web/components/ui/Button.tsx`
- `web/components/ui/Input.tsx`
- `web/components/ui/Textarea.tsx`
- `web/components/ui/Select.tsx`
- `web/components/ui/Combobox.tsx`
- `web/components/ui/Modal.tsx`
- `web/components/ui/Drawer.tsx`
- `web/components/ui/Dropdown.tsx`
- `web/components/ui/Tabs.tsx`
- `web/components/ui/Table.tsx`
- `web/components/ui/Toast.tsx`
- `web/components/ui/Tooltip.tsx`
- `web/components/ui/Skeleton.tsx`
- `web/components/ui/EmptyState.tsx`
- `web/components/ui/ErrorState.tsx`
- `web/components/ui/StatusBadge.tsx`

### Shell
- `web/components/shell/AppShell.tsx`
- `web/components/shell/NavRail.tsx`
- `web/components/shell/TopBar.tsx`
- `web/components/shell/DetailPane.tsx`
- `web/components/shell/SettingsModal.tsx`
- `web/components/shell/ThemeProvider.tsx`

### MyWork
- `web/components/mywork/MyWorkShell.tsx`
- `web/components/mywork/MyWorkSidebar.tsx`
- `web/components/mywork/CopilotRail.tsx`

### Admin Onboarding (New)
- `web/components/onboarding/OnboardingWizard.tsx`
- `web/components/onboarding/StepWelcome.tsx`
- `web/components/onboarding/StepCompanyProfile.tsx`
- `web/components/onboarding/StepSelectModules.tsx`
- `web/components/onboarding/StepConfigureModule.tsx`
- `web/components/onboarding/StepReview.tsx`
- `web/components/onboarding/ProgressIndicator.tsx`
- `web/components/onboarding/ModuleCard.tsx`
- `web/components/onboarding/QuestionCard.tsx`
- `web/components/onboarding/StageBuilder.tsx`

### Hooks (New)
- `web/hooks/useStagger.ts`
- `web/hooks/useOnboarding.ts`

### Types (New)
- `web/types/onboarding.ts`
