# Admin User Management Copilot Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an AI-powered user management system for the Admin portal that handles user creation, permission assignment, bulk import, and permission auditing through conversational AI with visual checklists and manual override capabilities.

**Architecture:** Embedded assistant in AdminUsersPanel with expansion to full Copilot for complex flows. Single backend toolset shared between both surfaces. Hybrid permission model with role-based presets and intelligent follow-up questions.

**Tech Stack:** React, TypeScript, Next.js, FastAPI, SQLAlchemy, Ollama

---

## 1. Architecture Overview

### 1.1 Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `AdminUsersPanel.tsx` | `web/components/admin/` | Enhanced user list with search/filter/groups |
| `UserDetailPanel.tsx` | `web/components/admin/` | Slide-out detail panel with activity metrics |
| `UserManagementAssistant.tsx` | `web/components/admin/` | Embedded mini Copilot for quick actions |
| `AdminUserManagementCopilot.tsx` | `web/components/admin/` | Full Copilot interface for complex flows |
| `admin_tools.py` | `packages/modules/agent/tools/` | Backend tools for user management |

### 1.2 Data Flow

```
[AdminUsersPanel] ←→ [UserManagementAssistant] ←→ [Backend Tools]
        ↓                                           ↑
[UserDetailPanel]                                 │
        ↓                                          │
[AdminUserManagementCopilot] ──────────────────────┘
```

### 1.3 Two Interfaces

**Embedded Assistant (quick actions):**
- Located in AdminUsersPanel (bottom-right or collapsible sidebar)
- Context-aware (knows selected user)
- Quick action chips: "Add user", "Find inactive", "Show accounting team"
- "Open full Copilot" button for complex flows

**Full Copilot (complex flows):**
- Bulk import with validation
- Permission audit
- Multi-step user creation with follow-up questions
- Conversational configuration with visual checklist

---

## 2. User List & Detail Panel

### 2.1 User List Row (Minimal At-a-Glance)

```
[Status Dot] [Name] [Email] [Role Badge] [Legal Entity] [Activity] [>]
```

- **Status dot:** Green (active) / Gray (inactive)
- **Role badge:** Color-coded by role (admin=blue, manager=green, accounting=amber, etc.)
- **Legal entity:** Company/entity assignment
- **Activity indicator:** "Active today", "2 weeks ago", etc.
- **Click anywhere** → opens slide-out detail panel

### 2.2 List Header (Aggregated Metrics)

```
[23 Active] [5 Accountants] [2 Secretaries] [3 Inactive]
```

### 2.3 Advanced Search/Filter/Groups

**Search:** Text search across name, email, department

**Filters:**
- By role (employee, manager, accounting, admin, executive, secretary)
- By legal entity
- By capability (has can_create_expenses, has can_access_accounting, etc.)
- By status (active/inactive) — toggle for inactive
- By delegation (is a secretary / has a secretary)

**Groups:**
- Group by role
- Group by legal entity
- Group by department
- Group by capability status

### 2.4 Detail Panel Sections

1. **Header** — Avatar, name, email, role badge, status toggle, last login
2. **Activity Metrics** — Cards: Last expense, Total expenses this month, Pending approvals (if manager)
3. **Capabilities** — Grouped checklist with tooltips:
   - Expense Access: can_create_expenses, can_create_corporate_expenses, can_invoice_corporation
   - Accounting: can_access_accounting, can_view_analytics
   - Special: is_amex_reconciler, requires_time_tracking, has_executive_reporting
4. **Delegation** (for secretaries) — "Submits expenses for: [Boss Name]"
5. **Company Assignment** — Legal entity dropdown
6. **Projects** — Assigned projects (if applicable)
7. **Quick Actions** — "View activity log", "Reset password", "Deactivate"

---

## 3. Permission Model

### 3.1 Role-Based Defaults

| Role | Suggested Capabilities | Follow-up Question |
|------|----------------------|-------------------|
| Employee | can_create_expenses=true | None |
| Manager | can_create_expenses=true | None |
| Accountant | can_access_accounting=true, can_view_analytics=true, can_create_expenses=false | None |
| Executive | can_create_expenses=true, has_executive_reporting=true | None |
| Secretary | can_create_expenses=true | "Who does this secretary submit expenses for?" |
| Admin | All capabilities = false (config-only) | "Should this admin also submit expenses? Manage accounting?" |

### 3.2 Add-on Module Permissions

| Module | Company Flag | User Capability |
|--------|--------------|-----------------|
| Expenses | expenses_module_enabled | can_create_expenses (default true) |
| Time Tracking | time_allocation_module_enabled | requires_time_tracking |
| Amex Reconciliation | amex_reconciliation_module_enabled | is_amex_reconciler |
| Purchase Requests | purchase_requests_module_enabled | (role-based) |
| Accounting | accounting_module_enabled | can_access_accounting, can_view_analytics |
| Subcontractor | subcontractor_module_enabled | (special user type) |

### 3.3 User Assignments

| Assignment | Description |
|------------|-------------|
| Legal Entity | Which company/entity they belong to |
| Department | Organizational unit |
| Projects | Assigned projects (for time tracking) |
| Delegates For | Boss (for secretaries) |

### 3.4 Special User Types

| Type | Capabilities | Notes |
|------|--------------|-------|
| Subcontractor | can_create_expenses=false, limited access | Only sees own expenses |
| Executive Secretary | can_create_expenses=true, delegates_for_user_id set | Submits for boss |
| Amex Reconciler | is_amex_reconciler=true | Amex module must be enabled |

---

## 4. Backend Tools

### 4.1 New Tools to Add

```python
# In packages/modules/agent/tools/admin_tools.py

list_users(filters, group_by, include_inactive)
    # Returns users with metrics, filtering, grouping
    
get_user_permissions(user_id)
    # Returns detailed permission breakdown
    
get_user_activity(user_id)
    # Returns last login, expenses, etc.
    
create_user(email, name, role, legal_entity, capabilities, delegates_for)
    # Conversational with intelligent suggestions
    
update_user_permissions(user_id, capabilities, delegates_for)
    # Full capability management
    
bulk_import_users(csv_file_id)
    # CSV import with validation
    
audit_permissions(filter_type)
    # Find permission inconsistencies
```

### 4.2 Tool Specifications

#### `list_users`

```python
class ListUsersArgs(BaseModel):
    search: str | None = None  # Text search across name, email, department
    roles: list[str] | None = None  # Filter by role
    legal_entity_id: int | None = None  # Filter by entity
    capabilities: list[str] | None = None  # Filter by capability
    is_active: bool | None = None  # Filter by status
    has_delegation: bool | None = None  # Filter by delegation status
    group_by: str | None = None  # "role", "entity", "department", "capability"
    include_metrics: bool = False  # Include last login, expense count
```

#### `get_user_permissions`

```python
class GetUserPermissionsArgs(BaseModel):
    user_id: int

# Returns:
# - All capabilities with explanations
# - Delegation relationships
# - Module visibility (what they can see)
# - Role-based preset recommendations
```

#### `create_user`

```python
class CreateUserArgs(BaseModel):
    email: str
    full_name: str
    role: str  # employee, manager, accounting, admin, executive, secretary
    legal_entity_id: int | None = None
    department: str | None = None
    # Capabilities (optional, auto-suggested based on role)
    can_create_expenses: bool | None = None
    can_access_accounting: bool | None = None
    can_view_analytics: bool | None = None
    is_amex_reconciler: bool | None = None
    requires_time_tracking: bool | None = None
    has_executive_reporting: bool | None = None
    # Delegation
    delegates_for_user_id: int | None = None
    project_ids: list[int] | None = None
```

#### `audit_permissions`

```python
class AuditPermissionsArgs(BaseModel):
    check_type: str  # "role_capability_mismatch", "missing_assignments", "orphaned_data", "module_gaps"

# Returns findings like:
# - Accountants without accounting access
# - Secretaries without boss
# - Inactive users with pending expenses
# - Users with capabilities for disabled modules
```

---

## 5. Conversational Flows

### 5.1 User Creation Flow

```
Admin: "Add a new accountant"
Copilot: "I'll help you add an accountant. What's their email?"
Admin: "carlos@company.com"
Copilot: "And their full name?"
Admin: "Carlos Mendoza"
Copilot: [Shows checklist]
  ✓ Email: carlos@company.com
  ✓ Name: Carlos Mendoza
  ✓ Role: Accountant
  
  ○ Capabilities I'll set (based on role):
    ✓ can_access_accounting — View and work the accounting queue
    ✓ can_view_analytics — Access finance analytics dashboard
    ✗ can_create_expenses — Accountants typically don't submit their own expenses
    
  Which legal entity should they belong to?
Admin: "Entity MX"
Copilot: [Applies configuration] "Done! Carlos Mendoza is ready. They'll see Accounting Review and Finance Analytics when they log in."
```

### 5.2 Secretary Flow

```
Admin: "Add a new secretary"
Copilot: "I'll help you add a secretary. What's their email?"
Admin: "lucia@company.com"
Copilot: "And their full name?"
Admin: "Lucía García"
Copilot: [Shows checklist]
  ✓ Email: lucia@company.com
  ✓ Name: Lucía García
  ✓ Role: Secretary
  
  ○ Capabilities:
    ✓ can_create_expenses — Secretaries create expenses for themselves and their boss
    
  ○ Delegation:
    ? Who does this secretary submit expenses for?
    
  [Search input for boss selection]
Admin: "Roberto Mendoza"
Copilot: [Updates checklist]
  ✓ Delegates for: Roberto Mendoza
  
  Ready to create?
```

### 5.3 Bulk Import Flow

```
Admin: "Import 50 users from CSV"
Copilot: "Upload the CSV file and I'll preview the import."
[Admin uploads file]
Copilot: [Shows preview table]
  Row 1: ✅ maria@company.com — Manager, Entity MX
  Row 2: ✅ carlos@company.com — Accountant, Entity MX
  Row 3: ⚠️ existing@company.com — User already exists, will be skipped
  Row 4: ❌ invalid@email — Invalid email format
  
  2 users will be created, 1 skipped, 1 error.
  
  Capabilities will be set based on role:
  - Managers: can_create_expenses=true
  - Accountants: can_access_accounting=true, can_view_analytics=true
  
  Should I proceed?
Admin: "Yes, but skip row 3"
Copilot: [Creates users, shows results]
```

### 5.4 Permission Audit Flow

```
Admin: "Show users who might have wrong permissions"
Copilot: "I'll check for common issues..."
[Runs audit]
Copilot: [Shows findings]
  ⚠️ 3 Accountants without accounting access
  ⚠️ 2 Secretaries without a boss assigned
  ⚠️ 1 Inactive user with pending expenses
  ⚠️ 5 Users with time tracking but no projects
  
  Would you like me to fix any of these?
Admin: "Fix the accountants"
Copilot: [Applies fixes]
  ✅ Updated carlos@company.com: can_access_accounting=true
  ✅ Updated ana@company.com: can_access_accounting=true
  ✅ Updated pedro@company.com: can_access_accounting=true
```

---

## 6. AI Queries for User List

### 6.1 Simple Queries (Filter List Directly)

- "Show all accountants"
- "Find users in Entity MX"
- "Show inactive users"
- "Users with time tracking enabled"

### 6.2 Complex Queries (Return in Chat)

- "Users who haven't logged in this month"
- "Accountants without accounting access"
- "Secretaries without a boss assigned"
- "Users with time tracking but no projects"
- "How many executives have executive reporting?"

### 6.3 Query Handling Logic

```typescript
function handleQuery(query: string): void {
  if (isSimpleFilter(query)) {
    // Apply filter to list directly
    applyFilter(parseFilter(query));
  } else {
    // Return results in chat with "Apply as filter" option
    const results = await runComplexQuery(query);
    showInChat(results, { applyAsFilterButton: true });
  }
}
```

---

## 7. Frontend Implementation

### 7.1 AdminUsersPanel Enhancements

```tsx
// New props and state
interface AdminUsersPanelProps {
  companyId: number;
  users: UserFull[];
  onUsersChanged: (users: UserFull[]) => void;
  companySetup?: Record<string, unknown> | null;
  legalEntities: LegalEntity[];  // NEW: for company assignment
}

// New state
const [searchQuery, setSearchQuery] = useState("");
const [filters, setFilters] = useState<Filters>({});
const [groupBy, setGroupBy] = useState<GroupBy | null>(null);
const [showInactive, setShowInactive] = useState(false);
const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
const [copilotOpen, setCopilotOpen] = useState(false);
```

### 7.2 UserDetailPanel Component

```tsx
interface UserDetailPanelProps {
  user: UserFull;
  legalEntities: LegalEntity[];
  onSaved: (user: UserFull) => void;
  onBack: () => void;
}

// Sections:
// 1. Header with status toggle
// 2. Activity metrics cards
// 3. Capabilities checklist (grouped)
// 4. Delegation assignment
// 5. Company/project assignments
// 6. Quick actions
```

### 7.3 Embedded Assistant Component

```tsx
interface UserManagementAssistantProps {
  companyId: number;
  selectedUserId: number | null;
  onUserCreated: (user: UserFull) => void;
  onUserUpdated: (user: UserFull) => void;
  onOpenFullCopilot: () => void;
}

// Mini chat interface (300px wide)
// Context-aware based on selected user
// Quick action chips
// "Open full Copilot" button
```

---

## 8. Test Cases

### 8.1 Admin Navigation Test

**Given:** Admin user logs in
**When:** They navigate to Admin section
**Then:** They see two sections in the left navigation:
- Settings (containing: Onboarding, Company Setup, Expense Policy, Workflow, Users/Roles, Accounting Setup, Integrations, Platform API, Export)
- Operations (containing: Audit Log, CFDI Watcher, Notifications)

### 8.2 User Creation Tests

1. Create employee with defaults
2. Create accountant → verify can_access_accounting and can_view_analytics are set
3. Create secretary → verify delegation question appears
4. Create admin → verify config-only question appears
5. Create subcontractor → verify limited access

### 8.3 Permission Audit Tests

1. Accountant without accounting access → flag and offer fix
2. Secretary without boss → flag and offer fix
3. Inactive user with pending expenses → flag
4. User with capability for disabled module → flag

### 8.4 Visibility Tests

1. Admin with can_create_expenses=false → does NOT see My Expenses module
2. Admin with can_access_accounting=true → sees Accounting Review module
3. Accountant role → sees Accounting Review and Finance Analytics
4. Secretary with delegates_for_user_id → sees My Expenses with boss's expenses

---

## 9. Implementation Order

1. **Phase 1: Backend Tools**
   - Add new database columns (can_access_accounting, can_view_analytics)
   - Implement list_users, get_user_permissions, get_user_activity
   - Implement create_user with smart suggestions
   - Implement update_user_permissions
   - Implement audit_permissions

2. **Phase 2: User List Enhancement**
   - Add search/filter/groups to AdminUsersPanel
   - Add legal entity column
   - Add activity indicator
   - Add aggregated metrics header

3. **Phase 3: Detail Panel**
   - Create UserDetailPanel component
   - Implement capability checklist
   - Add activity metrics
   - Add delegation section

4. **Phase 4: Embedded Assistant**
   - Create UserManagementAssistant component
   - Connect to backend tools
   - Implement quick actions
   - Add context awareness

5. **Phase 5: Full Copilot**
   - Create AdminUserManagementCopilot component
   - Implement conversational flows
   - Add visual checklist
   - Add bulk import and audit

---

## 10. Database Schema Changes

Already implemented:
- `can_access_accounting` column on `users` table
- `can_view_analytics` column on `users` table

Migration: `g7d8e9f0a1b2_add_accounting_analytics_capabilities.py`

---

## 11. Success Criteria

1. Admin can create users through conversational AI with intelligent suggestions
2. Admin can bulk import users from CSV with validation
3. Admin can audit permissions and fix inconsistencies
4. User list shows minimal at-a-glance info with slide-out detail
5. Embedded assistant provides quick actions in context
6. Full Copilot handles complex flows with visual checklist
7. All user types have correct module visibility based on capabilities
8. Admin navigation shows Settings and Operations sections correctly