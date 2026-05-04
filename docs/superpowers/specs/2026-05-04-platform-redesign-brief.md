# OpsFlow Platform Redesign — Design Brief

## 1. Feature Summary

Complete visual and UX overhaul of OpsFlow, a financial operations command center for enterprise finance teams. The redesign targets production-ready quality across all portals (MyWork, Admin, SuperAdmin) with a unified command center paradigm, dual-mode theming (dark/light equal priority), and indigo accent color replacing teal.

## 2. Primary User Action

Finance professionals need to complete their workflows (expense approvals, CFDI processing, reconciliation) faster with fewer errors while maintaining audit compliance. Every screen should answer: "What needs my attention now, and what action should I take?"

## 3. Design Direction

### Color Strategy
**Restrained** — Tinted neutrals + one saturated accent ≤10%. Indigo replaces teal as the primary accent. Semantic colors (success/warning/danger) remain consistent.

### Theme Scene Sentence
"Controller reviewing month-end close at 10pm under office fluorescents, then continuing on iPad in a dim home office, then checking approvals on phone in bright daylight."

This forces **dual-mode equal** — neither dark nor light is secondary. Both must be equally polished with proper contrast, hierarchy, and readability.

### Named Anchor References
1. **Salesforce Lightning** — Information density with clarity, adaptive navigation, contextual sidebars
2. **Bloomberg Terminal** — Data-first design, dense but scannable, professionals who live in the tool
3. **Linear** — Modern command center aesthetic, keyboard-driven, polished interactions

### Anti-References (from PRODUCT.md)
- Pastel/washed-out colors
- SaaS cliché gradients
- Generic blue SaaS templates
- Navy-and-gold finance clichés
- Side-stripe borders >1px
- Identical card grids

## 4. Scope

| Dimension | Target |
|-----------|--------|
| **Fidelity** | Production-ready — ship-quality components, full theme system, all screens |
| **Breadth** | Entire platform — MyWork, Admin, SuperAdmin portals |
| **Interactivity** | Shipped-quality — real hover states, loading states, transitions |
| **Time intent** | Polish until it ships — this is the visual foundation |

## 5. Layout Strategy

### Unified Command Center Paradigm
Single entry point (`/mywork`) with modules as contextual tabs. Persistent elements:
- **Top rail** — Global search, AI assistant toggle, notifications, settings
- **Adaptive sidebar** — Contextual to current module, collapses to icons on tablet
- **Main workspace** — Content area that adapts to current task

### Navigation Hierarchy
```
┌─────────────────────────────────────────────────────┐
│ Logo | Search... | AI Copilot | Bell | Avatar      │ ← Top rail (always visible)
├──────┬──────────────────────────────────────────────┤
│ M    │                                              │
│ o    │                                              │
│ d    │  Main Workspace                              │
│ u    │  (Adaptive to current context)               │
│ l    │                                              │
│ e    │                                              │
│      │                                              │
│ R    │                                              │
│ a    │                                              │
│ i    │                                              │
│ l    │                                              │
├──────┴──────────────────────────────────────────────┤
│ Module Tabs: Expenses | Approvals | CFDI | Reports  │ ← Tab rail (contextual)
└──────────────────────────────────────────────────────┘
```

### Adaptive Sidebar Behavior
- **Desktop**: Full width (200px), shows icons + labels
- **Tablet**: Collapsed (56px), icons only
- **Mobile**: Hidden, hamburger menu opens drawer

### Master-Detail Patterns
List views use a master-detail pattern where appropriate:
- List on left (40% width on desktop, full on mobile)
- Detail panel on right (60% width, or modal on mobile)

## 6. Key States

### Global States
| State | User Needs |
|-------|------------|
| **Default** | Clear hierarchy, obvious next action |
| **Loading** | Skeleton screens, not spinners (except initial load) |
| **Empty** | Purposeful empty states with clear call-to-action |
| **Error** | Inline errors with recovery guidance, not blocking modals |
| **Offline** | Graceful degradation, queue actions for sync |

### Per-Screen States
- **MyWork Dashboard**: Today's tasks, pending approvals, quick actions
- **Expense List**: Filters, bulk actions, status indicators
- **Approval Queue**: Priority ordering, quick approve/reject, batch operations
- **CFDI Viewer**: Document preview, validation status, linked records
- **Admin Settings**: Sections with clear save/cancel actions

## 7. Interaction Model

### Keyboard-First
- `Cmd/Ctrl + K` — Global command palette / search
- `Cmd/Ctrl + /` — AI Copilot focus
- `Tab` — Logical focus order through interactive elements
- Arrow keys — Navigate lists and menus

### Feedback Loops
- **Immediate**: Hover states, button press states, focus rings
- **In-progress**: Loading skeletons, progress bars for long operations
- **Completed**: Toast notifications (non-blocking), status badge updates
- **Error**: Inline error messages with recovery actions

### Motion Principles
- **Duration**: 150-200ms for state changes, 300ms for layout shifts
- **Easing**: ease-out-quart for enter, ease-in-quart for exit
- **Purpose**: Show relationships (panel slides in from source), indicate progress

## 8. Content Requirements

### Core Copy Tone
Clear, direct, professional. No whimsy, no startup playfulness.

| Context | Example |
|---------|---------|
| **Labels** | "Pending Approvals" not "Approvals Waiting for You" |
| **Empty states** | "No expenses to review" + "Create expense" button |
| **Errors** | "Connection failed. Retry or work offline?" |
| **Success** | Brief toast, auto-dismiss after 3s |

### Dynamic Content Ranges
- **Lists**: 0 (empty) → 50 (typical) → 500+ (power user) items
- **Notifications**: 0 → 5 → 50 unread
- **Approval queue**: 0 → 10 → 100 pending items
- **Form fields**: Standard forms 5-15 fields, complex forms up to 30

### Localization
All strings must support i18n (Spanish primary, English secondary). Plan for 30% text expansion in Spanish.

## 9. Recommended References

During implementation, consult these impeccable references:

| Reference | Why |
|-----------|-----|
| `spatial-design.md` | Master-detail layouts, responsive breakpoints |
| `interaction-design.md` | Form patterns, keyboard navigation |
| `motion-design.md` | Transition timing, animation curves |
| `color-design.md` | Theme token architecture, OKLCH usage |
| `typography-design.md` | Type scale, hierarchy implementation |

## 10. Open Questions

1. **Indigo shade**: Deep indigo (#4338ca) or brighter (#6366f1)? Need to test against both themes.
2. **Command palette**: Should AI Copilot integrate with `Cmd+K` palette or be separate (`Cmd+/`)?
3. **Mobile detail view**: Slide-over panel or full-screen takeover?
4. **Toast position**: Bottom-right (traditional) or bottom-center (mobile-friendly)?

---

## Confirmation Required

This brief is ready for your approval. Once confirmed, I'll proceed with implementation via `/impeccable craft` or hand off to your preferred execution method.

**Key decisions to confirm:**
- [ ] Indigo accent replacing teal
- [ ] Unified command center layout with adaptive sidebar
- [ ] Dual-mode equal theming (dark and light equally prioritized)
- [ ] Production-ready fidelity across entire platform
- [ ] Keyboard-first interaction model