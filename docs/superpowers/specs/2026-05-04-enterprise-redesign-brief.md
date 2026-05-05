# OpsFlow Enterprise Redesign - Design Brief

## 1. Feature Summary

Complete visual and interaction redesign of OpsFlow's financial operations platform. Transform from basic dark-mode utility into a premium, AI-forward enterprise command center. Target users are finance teams (controllers, accountants, CFOs) who need speed, clarity, and confidence during high-pressure periods like month-end close and audit season.

## 2. Primary User Action

**"Complete financial workflows faster with AI guidance."** Users should feel the AI assistant is always available but never intrusive—helping them categorize expenses, route approvals, and resolve exceptions without friction.

## 3. Design Direction

### Color Strategy: **Committed**
One saturated accent carries 30-60% of key surfaces. Not Restrained—the platform should feel alive and intelligent. Rich, vibrant palette with deep colors, subtle gradients, and glowing accents for premium feel.

### Theme Scene Sentence
*"A finance controller at 9pm during month-end close, working on a 27-inch monitor in a dim office, needs to see exception alerts clearly while the AI assistant suggests categorizations in the periphery without breaking focus."*

**Forces: Dark mode default** (dim office, late hours). Light mode must be equally commanding—not washed out. High contrast for exception alerts. AI presence in sidebar/periphery, not blocking primary work.

### Anchor References
1. **Salesforce Einstein** — Enterprise but modern, AI-forward design with assistant integration
2. **Bloomberg Terminal** — Dense information with clear hierarchy, power-user focus
3. **Linear** — Premium feel, thoughtful motion, beautiful typography

### Visual Style
- Rich & vibrant: deep colors, subtle gradients, glowing accents
- Premium feel without being flashy
- Dense information with visual hierarchy
- AI assistant always accessible but not dominating

## 4. Scope

| Dimension | Scope |
|-----------|-------|
| **Fidelity** | Production-ready |
| **Breadth** | One complete surface first (MyWork portal) |
| **Interactivity** | Shipped-quality with animations |
| **Approach** | Establish new component patterns, then expand to all portals |

**Surfaces to redesign** (priority order):
1. MyWork portal (employee expenses, dashboard) — FIRST
2. Navigation shell (sidebar, top bar, app frame)
3. Admin portal (setup, configuration, workflows)
4. SuperAdmin portal (AI policy, system config)

## 5. Layout Strategy

### Information Architecture
- **Dense but organized** — Like Bloomberg/Salesforce, show what matters
- **Progressive disclosure** — Essential first, details on demand
- **AI companion sidebar** — Always present, expandable for detailed assistance
- **Contextual AI** — Inline suggestions where decisions are made

### Visual Hierarchy
1. **Primary**: Active work surface (expense list, approval queue)
2. **Secondary**: Navigation, filters, metadata
3. **Tertiary**: AI assistant, help, settings

### Key Layout Decisions
- **Sidebar navigation**: Persistent, collapsible, with AI assistant dock
- **Content area**: Generous but not wasteful—respect screen real estate
- **Floating elements**: Modals minimized, prefer inline expansion
- **Hero moments**: Dashboard headers, empty states, success celebrations

## 6. Key States

| State | User Need | Visual Treatment |
|-------|-----------|-----------------|
| **Default** | See work at a glance | Dense list/grid, clear status indicators |
| **Empty** | Understand what to do | Hero illustration + clear CTA + AI suggestion |
| **Loading** | Know system is working | Skeleton screens, not spinners |
| **Error** | Understand and recover | Inline error with fix suggestion, AI offers help |
| **Success** | Feel accomplishment | Subtle celebration, AI confirms completion |
| **AI Thinking** | Know AI is processing | Pulsing accent, typing indicator |
| **AI Suggestion** | Accept or dismiss easily | Inline card with accept/reject actions |

## 7. Interaction Model

### Navigation
- **Sidebar**: Expandable sections, AI assistant dock at bottom
- **Top bar**: Contextual actions, search, notifications
- **Breadcrumbs**: Where am I? Quick navigation back

### Primary Workflows
1. **Expense submission**: Upload → AI extract → Review → Submit
2. **Approval queue**: See exceptions → AI suggests action → Approve/Reject
3. **Reconciliation**: Match → AI suggests matches → Confirm

### Micro-interactions
- **Hover**: Subtle lift, accent glow on interactive elements
- **Focus**: Clear ring, accent color
- **Loading states**: Progressive reveal, not blocking spinners
- **Success**: Brief highlight pulse, status change

### AI Assistant Behavior
- **Docked sidebar**: Collapsed by default, shows thinking/suggestions
- **Expandable**: Click to open full conversation
- **Inline**: Suggestions appear next to relevant fields
- **Proactive**: AI offers help when stuck, but dismissible

## 8. Content Requirements

### Hero Sections
- Dashboard welcome header with user name, date, AI greeting
- Empty state illustrations for each module
- Success celebration moments

### AI Messaging
- Friendly but professional tone
- Specific suggestions, not generic advice
- Acknowledge uncertainty: "I'm 85% confident this is..."

### Status Labels
- Clear, concise: "Pending approval", "Exception: Missing receipt"
- Color-coded with semantic meaning
- Icons where they add clarity

### Error Messages
- What went wrong
- How to fix it
- AI offer: "Want me to help fix this?"

## 9. Visual Elements to Add

### Hero Banners
- Dashboard header with gradient/accent background
- Module welcome sections
- Empty states with illustration + CTA

### Status Illustrations
- Empty inbox
- All caught up / zero items
- Error states
- Success celebrations

### Data Visualizations
- Expense breakdown charts
- Approval progress indicators
- Trend sparklines
- Metric cards with context

### Contextual Graphics
- Category icons for expense types
- Status badges with subtle animation
- Loading skeletons that match final layout
- AI thinking indicators

## 10. Recommended References

For implementation, consult:
- [spatial-design.md](spatial-design.md) — Dense layouts, information hierarchy
- [motion-design.md](motion-design.md) — Premium feel through animation
- [interaction-design.md](interaction-design.md) — AI assistant patterns
- [typography.md](typography.md) — Dense but readable text hierarchy

## 11. Open Questions

Resolved during implementation:
- Exact accent color shift (exploring rich vibrant palettes)
- Animation timing for premium feel
- AI avatar/identity representation
- Light mode treatment (once dark is approved)

---

## CONFIRMATION REQUIRED

**Does this brief capture the redesign direction you want?**

Key decisions:
- ✅ Dark mode default, premium rich aesthetic
- ✅ Dense information, organized hierarchy
- ✅ AI integrated throughout (sidebar + inline + proactive)
- ✅ Salesforce Einstein + Bloomberg + Linear as references
- ✅ MyWork portal first, then expand
- ✅ Production-ready fidelity with animations

**Reply "approved" or note what to change.**