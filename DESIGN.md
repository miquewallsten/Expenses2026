---
name: Financial Ops Platform
description: Enterprise expense management with calm, precise efficiency
colors:
  canvas: "#000000"
  panel: "#1C1C1E"
  surface: "#2C2C2E"
  elevated: "#3A3A3C"
  text-primary: "#FFFFFF"
  text-secondary: "#8E8E93"
  text-muted: "#636366"
  accent: "#0A84FF"
  accent-hover: "#0077E6"
  success: "#34C759"
  warning: "#F59E0B"
  danger: "#EF4444"
  border-subtle: "rgba(255,255,255,0.06)"
  border-standard: "rgba(255,255,255,0.10)"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
  overline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif"
    fontSize: "9px"
    fontWeight: 600
    letterSpacing: "0.06em"
    textTransform: "uppercase"
  mono:
    fontFamily: "\"SF Mono\", SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace"
    fontSize: "12px"
    fontWeight: 400
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  tight: "4px"
  default: "8px"
  comfortable: "12px"
  spacious: "16px"
components:
  button-primary:
    backgroundColor: "rgba(10,132,255,0.85)"
    textColor: "#FFFFFF"
    rounded: "6px"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "rgba(10,132,255,0.85)"
  button-secondary:
    backgroundColor: "rgba(255,255,255,0.04)"
    textColor: "rgba(255,255,255,0.75)"
    rounded: "6px"
    padding: "6px 12px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "rgba(255,255,255,0.55)"
    rounded: "6px"
    padding: "6px 12px"
  status-badge:
    backgroundColor: "rgba(52,199,89,0.12)"
    textColor: "#34D399"
    rounded: "9999px"
    padding: "2px 8px"
---

# Design System: Financial Ops Platform

## 1. Overview

**Creative North Star: "The Quiet Cockpit"**

A professional's interface — the calm competence of a well-designed cockpit. Every control in reach, every signal clear, nothing screaming for attention unless it matters. The UI is dark, precise, and confident. It respects the finance professional's focus: dense information, fast workflows, no hand-holding.

This system explicitly rejects:
- **Generic SaaS dashboards** — No gradient hero metrics, identical card grids, cream backgrounds, or "AI-powered" badges
- **Enterprise clutter** — No dense 20-column tables, sidebar overload, nested menus three levels deep

The design stays out of the way. When everything is fine, it's invisible. When something needs attention, it signals clearly.

**Key Characteristics:**
- Dark-mode-first with full light-mode support via CSS custom property inversion
- Information density with visual hierarchy — group related actions, distinguish primary from secondary
- Motion with purpose — state changes, context shifts, never decoration
- One accent color used sparingly — the primary action is always clear, never competing with the content
- Progressive disclosure — essential first, details on demand

## 2. Colors

The palette is an Apple Design System adaptation: tinted neutrals with one saturated accent. The system uses CSS custom properties that flip automatically between dark and light mode via `:root` and `html.light` selectors.

### Primary

- **Accent Blue** (#0A84FF / oklch(52% 0.25 250)): The single voice. Used for primary buttons, active navigation, focus rings, selection highlights. Never used as background大面积. Appears on ≤10% of any screen.

**The One Voice Rule.** The accent is used sparingly. Its rarity is the point. When a user sees blue, they know it's the primary action. No other element competes for that attention.

### Semantic

- **Success** (#34C759): Approved, completed, positive states. Used in status badges and confirmation icons.
- **Warning** (#F59E0B): Pending, attention-needed. Amber signals without alarm.
- **Danger** (#EF4444): Rejected, errors, destructive actions. Red for what requires immediate attention.

### Neutral

- **Canvas** (#000000): The app background. Nothing sits directly on this except panels and elevated surfaces.
- **Panel** (#1C1C1E): Sidebars, top bar, rails. The first elevation from canvas.
- **Surface** (#2C2C2E): Cards, form sections, detail panels. The work surface.
- **Elevated** (#3A3A3C): Hover states, dropdowns, modals. Subtle lift from surface.

- **Text Primary** (#FFFFFF / white): Body text, headings, labels. 100% opacity in dark mode.
- **Text Secondary** (white/60%): Secondary text, descriptions, placeholder text. Readable but de-emphasized.
- **Text Muted** (white/35%): Very muted text, disabled states, hints. Barely there but still legible.

### Borders

- **Hairline** (white/4%): List item separators, subtle dividers. The faintest visual separation.
- **Subtle** (white/6%): Card borders, section dividers, panel borders. Present but not insistent.
- **Standard** (white/10%): Input borders, focusable element borders. Visible but not dominant.
- **Active** (rgba(10,132,255,0.35%)): Active/selected state borders, focused inputs. Accent-colored to signal interaction.

### Light Mode

All colors invert via CSS custom properties. The neutral hierarchy flips: `#F2F2F7` becomes canvas, `#FFFFFF` becomes surface. Accent blue shifts to `#007AFF` for proper contrast on light backgrounds.

## 3. Typography

**Display Font:** SF Pro Text (system font stack)
**Body Font:** SF Pro Text (system font stack)
**Label/Mono Font:** SF Mono (system monospace stack)

**Character:** The typography is invisible. SF Pro Text is the default for a reason — it's what users expect from a professional tool on Apple platforms. No custom fonts, no personality. The content is the interface.

### Hierarchy

- **Display** (600, 20px, 1.2): Page titles, welcome screens. Used sparingly, at most once per screen.
- **Heading** (600, 16px, 1.3): Section headers, modal titles, card headers. The primary container label.
- **Title** (600, 14px, 1.4): Subsection headers, list group labels. One level down from heading.
- **Body** (400, 13px, 1.5): Primary content, descriptions, form inputs. Capped at 65–75ch line length for readability.
- **Label** (500, 11px, 1.4): Form labels, navigation items, table headers. Short and punchy.
- **Overline** (600, 9px, 1, uppercase, 0.06em tracking): Section labels, metadata badges. The smallest and most capitalized.

**The Density Rule.** Body text at 13px, labels at 11px, overlines at 9px. The scale is tight but hierarchical. Adjacent levels differ by ≥1.25×. No two levels are visually similar.

## 4. Elevation

This system uses **tonal layering**, not shadows. Depth is communicated through background value, not drop shadows.

- **Canvas** (darkest): The app background. Nothing sits directly on this except panels.
- **Panel** (+1 step lighter): Sidebars, navigation, top bar. Elevated from canvas.
- **Surface** (+2 steps lighter): Cards, form sections, detail panels. The primary work surface.
- **Elevated** (+3 steps lighter): Hover states, dropdown menus, modals. The highest lift.

**The Flat-By-Default Rule.** Surfaces are flat at rest. Elevation appears only as a response to state (hover, focus, modal). No decorative shadows.

When shadows are absolutely necessary (modals, dropdowns), use:
- **Shadow 1** (0 1px 2px rgba(0,0,0,0.2)): Hover lift on rows, buttons
- **Shadow 2** (0 2px 8px rgba(0,0,0,0.25)): Active cards, dropdowns
- **Shadow 3** (0 4px 16px rgba(0,0,0,0.3)): Modals, drawers

## 5. Components

### Buttons

- **Shape:** Gently rounded (6px radius)
- **Primary:** Accent blue background at 85% opacity, white text, indigo border at 40% opacity. Hover brightens to 85% blue. Active scales to 97% (subtle press). Focus shows a ring.
- **Secondary:** White at 4% opacity background, white/75% text, white/10% border. Hover increases to 7% background. For secondary actions.
- **Ghost:** Transparent background, white/55% text, no border. Hover shows white/5% background. For tertiary actions and navigation.
- **Danger:** Red/80% background, white text. For destructive actions.

**The One Primary Rule.** Every screen has one primary action. Secondary and ghost buttons exist, but they don't compete for attention.

### Status Badges

- **Shape:** Pill (rounded-full, 9999px)
- **Style:** Background-tinted with matching border. Never solid backgrounds. The color is the background at 12% opacity with a 30% opacity border.
- **Sizes:**
  - **Dot:** 6px circle for compact lists
  - **Badge:** 9px uppercase bold text with 2px padding
  - **Card:** Dot + text inline for card headers

### Cards / Containers

- **Corner Style:** 6px radius (matches buttons)
- **Background:** Surface (#2C2C2E) on dark, white on light
- **Shadow Strategy:** Flat by default. Shadow 2 on hover/active if needed.
- **Border:** Subtle border (white/6%) always present. Hairline borders inside cards for sections.
- **Internal Padding:** 12px default, 16px for spacious sections

### Inputs / Fields

- **Style:** Surface-0 background, standard border (white/10%), 6px radius
- **Height:** 32px (h-8) standard, 28px (h-7) for compact, 40px (h-10) for prominent
- **Focus:** Active border (indigo/35%) + subtle glow (rgba(10,132,255,0.1) 0 0 0 2px)
- **Error:** Red/50% border, red/70% error text below

### Navigation

- **Style:** Ghost buttons in a horizontal or vertical stack
- **Active State:** Background tint (indigo/8%), border (indigo/12%), white text
- **Inactive State:** white/45% text, no background
- **Hover:** white/70% text, white/4% background
- **Icon Size:** 20px, with 4px gap to label

## 6. Do's and Don'ts

### Do:

- **Do** use white opacity values for borders and text (white/60%, white/10%) instead of raw hex codes. The token system handles light-mode inversion automatically.
- **Do** cap body text at 65–75ch line length for readability.
- **Do** use motion only for state changes — a row highlighting when data changes, a drawer sliding in to show context.
- **Do** use the accent sparingly. It appears on ≤10% of any screen. Its rarity is the point.
- **Do** show status with background-tinted badges, not solid colors. The 12% background + 30% border formula creates the right visual weight.
- **Do** use `text-[11px]` for labels, `text-xs` for body, `text-[9px]` only for overlines and badges.

### Don't:

- **Don't** use `neutral-*` colors. Use `zinc-*` or `white/opacity` instead. The neutral palette is not part of the design system.
- **Don't** add `dark:` prefixes to classes. The token system handles theming via CSS custom properties. Use `[html.light_&]:` for light-mode variants.
- **Don't** use raw hex or `rgb()` values in className. Use Tailwind utilities only — they resolve to the token values.
- **Don't** create gradient backgrounds on cards, buttons, or hero sections. This is not a marketing landing page.
- **Don't** use side-stripe borders greater than 1px as a colored accent on cards or list items. Full borders or background tints only.
- **Don't** wrap everything in a container. Most elements don't need one. Use whitespace to separate, not containers to decorate.
- **Don't** use em dashes (`—`). Use commas, colons, semicolons, periods, or parentheses.
- **Don't** create identical card grids with icon + heading + text repeated endlessly. Vary the layout. Not every section needs a card.
- **Don't** reach for a modal as the first solution. Exhaust inline and progressive alternatives first. Modals are usually laziness.