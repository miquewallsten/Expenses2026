# Admin User Management Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an AI-powered user management system for the Admin portal that handles user creation, permission assignment, bulk import, and permission auditing through conversational AI with visual checklists and manual override capabilities.

**Architecture:** Embedded assistant in AdminUsersPanel with expansion to full Copilot for complex flows. Single backend toolset shared between both surfaces. Hybrid permission model with role-based presets and intelligent follow-up questions.

**Tech Stack:** React, TypeScript, Next.js, FastAPI, SQLAlchemy, Ollama

---

## Prerequisites (Already Completed)

The following were implemented in the previous session:

- Database migration for `can_access_accounting` and `can_view_analytics` columns
- Updated `models_user.py` with new capability columns
- Updated `schemas_user.py` with new capability fields
- Updated `UserContext.tsx` with new capabilities
- Updated `types/user.ts` with new capability types
- Updated `AdminUsersPanel.tsx` with new capability toggles
- Updated `moduleRegistry.ts` with visibility checks using new capabilities
- Updated `AdminNavigation.tsx` with Settings/Operations sections
- Updated `AdminModule.tsx` with new navigation structure
- Updated translations in `es.json` and `en.json`

---

## Task 1: Backend Tools - list_users

**Files:**
- Modify: `packages/modules/agent/tools/admin_tools.py`
- Test: `tests/test_admin_tools.py`

**Goal:** Add `list_users` tool that returns users with filtering, grouping, and metrics.

- [ ] **Step 1: Write the failing test for list_users**

```python
# In tests/test_admin_tools.py

def test_list_users_basic(db, admin_user, employee_user):
    """Test list_users returns all users for admin."""
    from packages.modules.agent.tools.admin_tools import _handle_list_users, ListUsersArgs
    from packages.modules.agent.core.context import AgentContext
    
    ctx = AgentContext(
        db=db,
        company_id=admin_user.company_id,
        user_id=admin_user.id,
        user_email=admin_user.email,
        user_role="admin",
        persona="admin",
    )
    
    result = _handle_list_users(ctx, ListUsersArgs())
    
    assert result.ok
    assert len(result.data["users"]) >= 2
    assert any(u["email"] == admin_user.email for u in result.data["users"])
    assert any(u["email"] == employee_user.email for u in result.data["users"])


def test_list_users_filter_by_role(db, admin_user, employee_user, accountant_user):
    """Test list_users filters by role."""
    from packages.modules.agent.tools.admin_tools import _handle_list_users, ListUsersArgs
    from packages.modules.agent.core.context import AgentContext
    
    ctx = AgentContext(
        db=db,
        company_id=admin_user.company_id,
        user_id=admin_user.id,
        user_email=admin_user.email,
        user_role="admin",
        persona="admin",
    )
    
    result = _handle_list_users(ctx, ListUsersArgs(roles=["accountant"]))
    
    assert result.ok
    assert len(result.data["users"]) == 1
    assert result.data["users"][0]["role"] == "accountant"


def test_list_users_include_metrics(db, admin_user, expense_factory):
    """Test list_users includes activity metrics when requested."""
    from packages.modules.agent.tools.admin_tools import _handle_list_users, ListUsersArgs
    from packages.modules.agent.core.context import AgentContext
    
    # Create an expense for the user
    expense = expense_factory(user_id=admin_user.id)
    
    ctx = AgentContext(
        db=db,
        company_id=admin_user.company_id,
        user_id=admin_user.id,
        user_email=admin_user.email,
        user_role="admin",
        persona="admin",
    )
    
    result = _handle_list_users(ctx, ListUsersArgs(include_metrics=True))
    
    assert result.ok
    user = next(u for u in result.data["users"] if u["id"] == admin_user.id)
    assert "last_expense_at" in user
    assert "expense_count" in user
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_admin_tools.py::test_list_users_basic -v`
Expected: FAIL with "module has no attribute 'ListUsersArgs'"

- [ ] **Step 3: Define ListUsersArgs schema**

```python
# In packages/modules/agent/tools/admin_tools.py

class ListUsersArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    search: str | None = None
    roles: list[str] | None = None
    legal_entity_id: int | None = None
    capabilities: list[str] | None = None
    is_active: bool | None = None
    has_delegation: bool | None = None
    group_by: str | None = None
    include_metrics: bool = False
```

- [ ] **Step 4: Implement _handle_list_users**

```python
# In packages/modules/agent/tools/admin_tools.py

def _handle_list_users(ctx: AgentContext, args: ListUsersArgs) -> ToolResult:
    if ctx.user_role != "admin":
        return ToolResult(
            ok=False,
            summary="list_users requires admin role",
            error="forbidden",
        )
    
    query = ctx.db.query(User).filter(User.company_id == ctx.company_id)
    
    # Apply filters
    if args.search:
        search_term = f"%{args.search}%"
        query = query.filter(
            (User.full_name.ilike(search_term)) |
            (User.email.ilike(search_term)) |
            (User.department.ilike(search_term))
        )
    
    if args.roles:
        query = query.filter(User.role.in_(args.roles))
    
    if args.legal_entity_id:
        query = query.filter(User.legal_entity_id == args.legal_entity_id)
    
    if args.is_active is not None:
        query = query.filter(User.is_active == args.is_active)
    
    if args.has_delegation is not None:
        if args.has_delegation:
            query = query.filter(User.delegates_for_user_id.isnot(None))
        else:
            query = query.filter(User.delegates_for_user_id.is_(None))
    
    if args.capabilities:
        for cap in args.capabilities:
            if hasattr(User, cap):
                query = query.filter(getattr(User, cap) == True)
    
    users = query.order_by(User.full_name).all()
    
    # Build result
    user_list = []
    for u in users:
        user_data = {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
            "department": u.department,
            "legal_entity_id": u.legal_entity_id,
            "delegates_for_user_id": u.delegates_for_user_id,
            "delegates_for_user_name": None,  # Will populate if needed
            "capabilities": {
                "can_create_expenses": u.can_create_expenses,
                "can_create_corporate_expenses": u.can_create_corporate_expenses,
                "can_invoice_corporation": u.can_invoice_corporation,
                "is_amex_reconciler": u.is_amex_reconciler,
                "requires_time_tracking": u.requires_time_tracking,
                "has_executive_reporting": u.has_executive_reporting,
                "can_access_accounting": u.can_access_accounting,
                "can_view_analytics": u.can_view_analytics,
            },
        }
        
        if args.include_metrics:
            user_data["last_login_at"] = u.last_login_at.isoformat() if u.last_login_at else None
            user_data["created_at"] = u.created_at.isoformat() if u.created_at else None
            # Expense count would require joining with expenses table - simplify for now
            user_data["expense_count"] = 0  # Placeholder
        
        user_list.append(user_data)
    
    # Grouping
    grouped = None
    if args.group_by:
        grouped = {}
        for u in user_list:
            key = u.get(args.group_by, "unknown")
            if key not in grouped:
                grouped[key] = []
            grouped[key].append(u)
    
    result_data = {"users": user_list}
    if grouped:
        result_data["grouped"] = grouped
    
    return ToolResult(
        ok=True,
        summary=f"Found {len(user_list)} users",
        data=result_data,
    )


REGISTRY.register(ToolSpec(
    name="list_users",
    description="Lista usuarios con filtros, agrupación y métricas opcionales.",
    category="read",
    input_schema=ListUsersArgs,
    handler=_handle_list_users,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
))
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_admin_tools.py -v -k "list_users"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/modules/agent/tools/admin_tools.py tests/test_admin_tools.py
git commit -m "feat(agent): add list_users tool with filtering and grouping"
```

---

## Task 2: Backend Tools - get_user_permissions

**Files:**
- Modify: `packages/modules/agent/tools/admin_tools.py`
- Test: `tests/test_admin_tools.py`

**Goal:** Add `get_user_permissions` tool that returns detailed permission breakdown with explanations.

- [ ] **Step 1: Write the failing test**

```python
# In tests/test_admin_tools.py

def test_get_user_permissions(db, admin_user, accountant_user):
    """Test get_user_permissions returns detailed breakdown."""
    from packages.modules.agent.tools.admin_tools import _handle_get_user_permissions, GetUserPermissionsArgs
    from packages.modules.agent.core.context import AgentContext
    
    ctx = AgentContext(
        db=db,
        company_id=admin_user.company_id,
        user_id=admin_user.id,
        user_email=admin_user.email,
        user_role="admin",
        persona="admin",
    )
    
    result = _handle_get_user_permissions(ctx, GetUserPermissionsArgs(user_id=accountant_user.id))
    
    assert result.ok
    assert "capabilities" in result.data
    assert "explanations" in result.data
    assert "module_visibility" in result.data
    assert "role_preset" in result.data
    assert result.data["role"] == "accountant"


def test_get_user_permissions_not_found(db, admin_user):
    """Test get_user_permissions returns error for non-existent user."""
    from packages.modules.agent.tools.admin_tools import _handle_get_user_permissions, GetUserPermissionsArgs
    from packages.modules.agent.core.context import AgentContext
    
    ctx = AgentContext(
        db=db,
        company_id=admin_user.company_id,
        user_id=admin_user.id,
        user_email=admin_user.email,
        user_role="admin",
        persona="admin",
    )
    
    result = _handle_get_user_permissions(ctx, GetUserPermissionsArgs(user_id=99999))
    
    assert not result.ok
    assert result.error == "not_found"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_admin_tools.py::test_get_user_permissions -v`
Expected: FAIL

- [ ] **Step 3: Define GetUserPermissionsArgs schema**

```python
# In packages/modules/agent/tools/admin_tools.py

class GetUserPermissionsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: int
```

- [ ] **Step 4: Implement _handle_get_user_permissions**

```python
# In packages/modules/agent/tools/admin_tools.py

# Capability explanations
CAPABILITY_EXPLANATIONS = {
    "can_create_expenses": "Can create and submit expense reports",
    "can_create_corporate_expenses": "Can create corporate card expenses",
    "can_invoice_corporation": "Can invoice on behalf of the corporation",
    "is_amex_reconciler": "Can reconcile AMEX statements",
    "requires_time_tracking": "Must track time on projects",
    "has_executive_reporting": "Can access executive analytics dashboard",
    "can_access_accounting": "Can access accounting review queue",
    "can_view_analytics": "Can view finance analytics",
}

# Role-based presets
ROLE_PRESETS = {
    "employee": {
        "can_create_expenses": True,
        "can_create_corporate_expenses": False,
        "can_invoice_corporation": False,
        "is_amex_reconciler": False,
        "requires_time_tracking": False,
        "has_executive_reporting": False,
        "can_access_accounting": False,
        "can_view_analytics": False,
    },
    "manager": {
        "can_create_expenses": True,
        "can_create_corporate_expenses": False,
        "can_invoice_corporation": False,
        "is_amex_reconciler": False,
        "requires_time_tracking": False,
        "has_executive_reporting": False,
        "can_access_accounting": False,
        "can_view_analytics": False,
    },
    "accounting": {
        "can_create_expenses": False,
        "can_create_corporate_expenses": False,
        "can_invoice_corporation": False,
        "is_amex_reconciler": False,
        "requires_time_tracking": False,
        "has_executive_reporting": False,
        "can_access_accounting": True,
        "can_view_analytics": True,
    },
    "admin": {
        "can_create_expenses": False,  # Config-only by default
        "can_create_corporate_expenses": False,
        "can_invoice_corporation": False,
        "is_amex_reconciler": False,
        "requires_time_tracking": False,
        "has_executive_reporting": False,
        "can_access_accounting": False,
        "can_view_analytics": False,
    },
    "executive": {
        "can_create_expenses": True,
        "can_create_corporate_expenses": False,
        "can_invoice_corporation": False,
        "is_amex_reconciler": False,
        "requires_time_tracking": False,
        "has_executive_reporting": True,
        "can_access_accounting": False,
        "can_view_analytics": False,
    },
    "secretary": {
        "can_create_expenses": True,
        "can_create_corporate_expenses": False,
        "can_invoice_corporation": False,
        "is_amex_reconciler": False,
        "requires_time_tracking": False,
        "has_executive_reporting": False,
        "can_access_accounting": False,
        "can_view_analytics": False,
    },
}

# Module visibility rules
def compute_module_visibility(role: str, capabilities: dict, company_modules: dict) -> dict:
    """Compute which modules a user can see."""
    visibility = {}
    
    # My Expenses: requires can_create_expenses AND expenses module
    visibility["my_expenses"] = (
        capabilities.get("can_create_expenses", True) and
        company_modules.get("expenses_module_enabled", True)
    )
    
    # Accounting Review: requires accounting role OR can_access_accounting
    visibility["accounting_review"] = (
        role == "accounting" or
        capabilities.get("can_access_accounting", False)
    ) and company_modules.get("accounting_module_enabled", True)
    
    # Finance Analytics: requires accounting/executive role OR can_view_analytics
    visibility["finance_analytics"] = (
        role in ("accounting", "executive") or
        capabilities.get("can_view_analytics", False)
    )
    
    # My Approvals: requires manager role
    visibility["my_approvals"] = (
        role == "manager" and
        company_modules.get("approvals_module_enabled", True)
    )
    
    return visibility


def _handle_get_user_permissions(ctx: AgentContext, args: GetUserPermissionsArgs) -> ToolResult:
    if ctx.user_role != "admin":
        return ToolResult(
            ok=False,
            summary="get_user_permissions requires admin role",
            error="forbidden",
        )
    
    user = (
        ctx.db.query(User)
        .filter(User.id == args.user_id, User.company_id == ctx.company_id)
        .one_or_none()
    )
    
    if not user:
        return ToolResult(
            ok=False,
            summary=f"User {args.user_id} not found",
            error="not_found",
        )
    
    capabilities = {
        "can_create_expenses": user.can_create_expenses,
        "can_create_corporate_expenses": user.can_create_corporate_expenses,
        "can_invoice_corporation": user.can_invoice_corporation,
        "is_amex_reconciler": user.is_amex_reconciler,
        "requires_time_tracking": user.requires_time_tracking,
        "has_executive_reporting": user.has_executive_reporting,
        "can_access_accounting": user.can_access_accounting,
        "can_view_analytics": user.can_view_analytics,
    }
    
    # Get company modules
    setup = (
        ctx.db.query(CompanySetup)
        .filter(CompanySetup.company_id == ctx.company_id)
        .first()
    )
    company_modules = {
        "expenses_module_enabled": setup.expenses_module_enabled if setup else True,
        "accounting_module_enabled": setup.accounting_module_enabled if setup else True,
        "approvals_module_enabled": setup.approvals_module_enabled if setup else True,
        "time_allocation_module_enabled": setup.time_allocation_module_enabled if setup else False,
        "amex_reconciliation_module_enabled": setup.amex_reconciliation_module_enabled if setup else False,
    }
    
    module_visibility = compute_module_visibility(user.role, capabilities, company_modules)
    
    # Get delegation info
    delegates_for_user = None
    if user.delegates_for_user_id:
        boss = ctx.db.query(User).filter(User.id == user.delegates_for_user_id).first()
        if boss:
            delegates_for_user = {"id": boss.id, "name": boss.full_name}
    
    return ToolResult(
        ok=True,
        summary=f"Permissions for {user.full_name}",
        data={
            "user_id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active,
            "capabilities": capabilities,
            "explanations": CAPABILITY_EXPLANATIONS,
            "module_visibility": module_visibility,
            "role_preset": ROLE_PRESETS.get(user.role, {}),
            "delegation": delegates_for_user,
            "legal_entity_id": user.legal_entity_id,
            "department": user.department,
        },
    )


REGISTRY.register(ToolSpec(
    name="get_user_permissions",
    description="Devuelve el desglose detallado de permisos de un usuario.",
    category="read",
    input_schema=GetUserPermissionsArgs,
    handler=_handle_get_user_permissions,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
))
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_admin_tools.py -v -k "get_user_permissions"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/modules/agent/tools/admin_tools.py tests/test_admin_tools.py
git commit -m "feat(agent): add get_user_permissions tool with module visibility"
```

---

## Task 3: Backend Tools - create_user with smart suggestions

**Files:**
- Modify: `packages/modules/agent/tools/admin_tools.py`
- Test: `tests/test_admin_tools.py`

**Goal:** Enhance `create_user` (already exists as `invite_user`) to accept capabilities and apply role-based preset suggestions.

- [ ] **Step 1: Write the failing test for enhanced create_user**

```python
# In tests/test_admin_tools.py

def test_create_user_with_role_preset(db, admin_user):
    """Test create_user applies role preset for accountant."""
    from packages.modules.agent.tools.admin_tools import _handle_create_user, CreateUserArgs
    from packages.modules.agent.core.context import AgentContext
    
    ctx = AgentContext(
        db=db,
        company_id=admin_user.company_id,
        user_id=admin_user.id,
        user_email=admin_user.email,
        user_role="admin",
        persona="admin",
    )
    
    result = _handle_create_user(ctx, CreateUserArgs(
        email="newaccountant@test.com",
        full_name="New Accountant",
        role="accounting",
    ))
    
    assert result.ok
    assert result.data["role"] == "accounting"
    assert result.data["capabilities"]["can_access_accounting"] == True
    assert result.data["capabilities"]["can_view_analytics"] == True
    assert result.data["capabilities"]["can_create_expenses"] == False


def test_create_user_secretary_needs_delegation(db, admin_user, boss_user):
    """Test create_user for secretary prompts for delegation."""
    from packages.modules.agent.tools.admin_tools import _handle_create_user, CreateUserArgs
    from packages.modules.agent.core.context import AgentContext
    
    ctx = AgentContext(
        db=db,
        company_id=admin_user.company_id,
        user_id=admin_user.id,
        user_email=admin_user.email,
        user_role="admin",
        persona="admin",
    )
    
    result = _handle_create_user(ctx, CreateUserArgs(
        email="newsecretary@test.com",
        full_name="New Secretary",
        role="secretary",
        delegates_for_user_id=boss_user.id,
    ))
    
    assert result.ok
    assert result.data["role"] == "secretary"
    assert result.data["delegates_for_user_id"] == boss_user.id
    assert result.data["capabilities"]["can_create_expenses"] == True


def test_create_user_with_custom_capabilities(db, admin_user):
    """Test create_user with explicit capabilities overrides preset."""
    from packages.modules.agent.tools.admin_tools import _handle_create_user, CreateUserArgs
    from packages.modules.agent.core.context import AgentContext
    
    ctx = AgentContext(
        db=db,
        company_id=admin_user.company_id,
        user_id=admin_user.id,
        user_email=admin_user.email,
        user_role="admin",
        persona="admin",
    )
    
    result = _handle_create_user(ctx, CreateUserArgs(
        email="customadmin@test.com",
        full_name="Custom Admin",
        role="admin",
        can_create_expenses=True,  # Override default
        can_access_accounting=True,
    ))
    
    assert result.ok
    assert result.data["capabilities"]["can_create_expenses"] == True
    assert result.data["capabilities"]["can_access_accounting"] == True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_admin_tools.py -v -k "test_create_user"`
Expected: FAIL with "CreateUserArgs not defined" or similar

- [ ] **Step 3: Define CreateUserArgs schema and enhance invite_user**

```python
# In packages/modules/agent/tools/admin_tools.py

class CreateUserArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(..., min_length=3, max_length=255)
    full_name: str = Field(..., min_length=1, max_length=255)
    role: str = Field(default="employee", pattern=r"^(employee|manager|accounting|admin|executive|secretary)$")
    legal_entity_id: int | None = None
    department: str | None = Field(default=None, max_length=100)
    # Capabilities (optional, auto-suggested based on role)
    can_create_expenses: bool | None = None
    can_create_corporate_expenses: bool | None = None
    can_invoice_corporation: bool | None = None
    is_amex_reconciler: bool | None = None
    requires_time_tracking: bool | None = None
    has_executive_reporting: bool | None = None
    can_access_accounting: bool | None = None
    can_view_analytics: bool | None = None
    # Delegation
    delegates_for_user_id: int | None = None
    project_ids: list[int] | None = None
    # Invitation
    send_invite: bool = True


def _handle_create_user(ctx: AgentContext, args: CreateUserArgs) -> ToolResult:
    if ctx.user_role != "admin":
        return ToolResult(
            ok=False,
            summary="create_user requires admin role",
            error="forbidden",
        )
    
    # Check for existing user
    existing = (
        ctx.db.query(User)
        .filter(User.email == args.email)
        .one_or_none()
    )
    if existing:
        return ToolResult(
            ok=False,
            summary=f"User with email {args.email} already exists",
            error="duplicate_email",
        )
    
    # Get role preset
    preset = ROLE_PRESETS.get(args.role, ROLE_PRESETS["employee"])
    
    # Apply preset values, allow overrides
    capabilities = {}
    capability_fields = [
        "can_create_expenses",
        "can_create_corporate_expenses",
        "can_invoice_corporation",
        "is_amex_reconciler",
        "requires_time_tracking",
        "has_executive_reporting",
        "can_access_accounting",
        "can_view_analytics",
    ]
    
    for field in capability_fields:
        provided_value = getattr(args, field, None)
        if provided_value is not None:
            capabilities[field] = provided_value
        else:
            capabilities[field] = preset.get(field, False)
    
    # Create user
    new_user = User(
        email=args.email,
        full_name=args.full_name,
        role=args.role,
        company_id=ctx.company_id,
        department=args.department,
        legal_entity_id=args.legal_entity_id,
        delegates_for_user_id=args.delegates_for_user_id,
        **capabilities,
    )
    ctx.db.add(new_user)
    ctx.db.commit()
    ctx.db.refresh(new_user)
    
    # Assign projects if provided
    if args.project_ids:
        from packages.core.platform.models_project import UserProject
        for pid in args.project_ids:
            up = UserProject(user_id=new_user.id, project_id=pid)
            ctx.db.add(up)
        ctx.db.commit()
    
    # Send invite if requested
    if args.send_invite:
        # TODO: Send magic link invite
        pass
    
    return ToolResult(
        ok=True,
        summary=f"Created user {args.email} as {args.role}",
        data={
            "user_id": new_user.id,
            "email": new_user.email,
            "full_name": new_user.full_name,
            "role": new_user.role,
            "capabilities": capabilities,
            "delegates_for_user_id": new_user.delegates_for_user_id,
        },
    )


# Replace the existing invite_user registration with create_user
# Update the existing tool registration
REGISTRY.register(ToolSpec(
    name="create_user",
    description="Crea un nuevo usuario con capacidades sugeridas según el rol.",
    category="config",
    input_schema=CreateUserArgs,
    handler=_handle_create_user,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_admin_tools.py -v -k "test_create_user"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/modules/agent/tools/admin_tools.py tests/test_admin_tools.py
git commit -m "feat(agent): enhance create_user with role-based preset capabilities"
```

---

## Task 4: Backend Tools - update_user_permissions

**Files:**
- Modify: `packages/modules/agent/tools/admin_tools.py`
- Test: `tests/test_admin_tools.py`

**Goal:** Add `update_user_permissions` tool for full capability management.

- [ ] **Step 1: Write the failing test**

```python
# In tests/test_admin_tools.py

def test_update_user_permissions(db, admin_user, employee_user):
    """Test updating user capabilities."""
    from packages.modules.agent.tools.admin_tools import (
        _handle_update_user_permissions, UpdateUserPermissionsArgs
    )
    from packages.modules.agent.core.context import AgentContext
    
    ctx = AgentContext(
        db=db,
        company_id=admin_user.company_id,
        user_id=admin_user.id,
        user_email=admin_user.email,
        user_role="admin",
        persona="admin",
    )
    
    result = _handle_update_user_permissions(ctx, UpdateUserPermissionsArgs(
        user_id=employee_user.id,
        can_access_accounting=True,
        can_view_analytics=True,
    ))
    
    assert result.ok
    assert result.data["capabilities"]["can_access_accounting"] == True
    assert result.data["capabilities"]["can_view_analytics"] == True


def test_update_user_delegation(db, admin_user, secretary_user, boss_user):
    """Test updating user delegation."""
    from packages.modules.agent.tools.admin_tools import (
        _handle_update_user_permissions, UpdateUserPermissionsArgs
    )
    from packages.modules.agent.core.context import AgentContext
    
    ctx = AgentContext(
        db=db,
        company_id=admin_user.company_id,
        user_id=admin_user.id,
        user_email=admin_user.email,
        user_role="admin",
        persona="admin",
    )
    
    result = _handle_update_user_permissions(ctx, UpdateUserPermissionsArgs(
        user_id=secretary_user.id,
        delegates_for_user_id=boss_user.id,
    ))
    
    assert result.ok
    assert result.data["delegates_for_user_id"] == boss_user.id
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_admin_tools.py -v -k "test_update_user_permissions"`
Expected: FAIL

- [ ] **Step 3: Define UpdateUserPermissionsArgs and implement**

```python
# In packages/modules/agent/tools/admin_tools.py

class UpdateUserPermissionsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: int
    # Capabilities
    can_create_expenses: bool | None = None
    can_create_corporate_expenses: bool | None = None
    can_invoice_corporation: bool | None = None
    is_amex_reconciler: bool | None = None
    requires_time_tracking: bool | None = None
    has_executive_reporting: bool | None = None
    can_access_accounting: bool | None = None
    can_view_analytics: bool | None = None
    # Delegation
    delegates_for_user_id: int | None = None
    # Projects
    project_ids: list[int] | None = None
    # Legal entity
    legal_entity_id: int | None = None


def _handle_update_user_permissions(ctx: AgentContext, args: UpdateUserPermissionsArgs) -> ToolResult:
    if ctx.user_role != "admin":
        return ToolResult(
            ok=False,
            summary="update_user_permissions requires admin role",
            error="forbidden",
        )
    
    user = (
        ctx.db.query(User)
        .filter(User.id == args.user_id, User.company_id == ctx.company_id)
        .one_or_none()
    )
    
    if not user:
        return ToolResult(
            ok=False,
            summary=f"User {args.user_id} not found",
            error="not_found",
        )
    
    changes: dict[str, Any] = {}
    
    # Update capabilities
    capability_fields = [
        "can_create_expenses",
        "can_create_corporate_expenses",
        "can_invoice_corporation",
        "is_amex_reconciler",
        "requires_time_tracking",
        "has_executive_reporting",
        "can_access_accounting",
        "can_view_analytics",
    ]
    
    for field in capability_fields:
        value = getattr(args, field, None)
        if value is not None:
            setattr(user, field, value)
            changes[field] = value
    
    # Update delegation
    if args.delegates_for_user_id is not None:
        # Verify the boss exists and is in the same company
        boss = (
            ctx.db.query(User)
            .filter(User.id == args.delegates_for_user_id, User.company_id == ctx.company_id)
            .first()
        )
        if not boss and args.delegates_for_user_id != 0:  # 0 means clear
            return ToolResult(
                ok=False,
                summary=f"Boss user {args.delegates_for_user_id} not found",
                error="invalid_delegation",
            )
        user.delegates_for_user_id = args.delegates_for_user_id if args.delegates_for_user_id != 0 else None
        changes["delegates_for_user_id"] = args.delegates_for_user_id
    
    # Update legal entity
    if args.legal_entity_id is not None:
        user.legal_entity_id = args.legal_entity_id
        changes["legal_entity_id"] = args.legal_entity_id
    
    # Update projects
    if args.project_ids is not None:
        from packages.core.platform.models_project import UserProject
        # Clear existing
        ctx.db.query(UserProject).filter(UserProject.user_id == user.id).delete()
        # Add new
        for pid in args.project_ids:
            up = UserProject(user_id=user.id, project_id=pid)
            ctx.db.add(up)
        changes["project_ids"] = args.project_ids
    
    ctx.db.commit()
    
    return ToolResult(
        ok=True,
        summary=f"Updated permissions for {user.email}",
        data={
            "user_id": user.id,
            "changes": changes,
        },
    )


REGISTRY.register(ToolSpec(
    name="update_user_permissions",
    description="Actualiza las capacidades y asignaciones de un usuario.",
    category="config",
    input_schema=UpdateUserPermissionsArgs,
    handler=_handle_update_user_permissions,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_admin_tools.py -v -k "test_update_user_permissions"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/modules/agent/tools/admin_tools.py tests/test_admin_tools.py
git commit -m "feat(agent): add update_user_permissions tool"
```

---

## Task 5: Backend Tools - audit_permissions

**Files:**
- Modify: `packages/modules/agent/tools/admin_tools.py`
- Test: `tests/test_admin_tools.py`

**Goal:** Add `audit_permissions` tool to find permission inconsistencies.

- [ ] **Step 1: Write the failing test**

```python
# In tests/test_admin_tools.py

def test_audit_permissions_role_mismatch(db, admin_user, accountant_user):
    """Test audit finds accountants without accounting access."""
    from packages.modules.agent.tools.admin_tools import (
        _handle_audit_permissions, AuditPermissionsArgs
    )
    from packages.modules.agent.core.context import AgentContext
    
    # Remove accounting access from accountant
    accountant_user.can_access_accounting = False
    db.commit()
    
    ctx = AgentContext(
        db=db,
        company_id=admin_user.company_id,
        user_id=admin_user.id,
        user_email=admin_user.email,
        user_role="admin",
        persona="admin",
    )
    
    result = _handle_audit_permissions(ctx, AuditPermissionsArgs(
        check_type="role_capability_mismatch"
    ))
    
    assert result.ok
    assert len(result.data["findings"]) >= 1
    assert any(f["type"] == "accountant_without_accounting_access" for f in result.data["findings"])


def test_audit_permissions_missing_delegation(db, admin_user, secretary_user):
    """Test audit finds secretaries without boss."""
    from packages.modules.agent.tools.admin_tools import (
        _handle_audit_permissions, AuditPermissionsArgs
    )
    from packages.modules.agent.core.context import AgentContext
    
    # Secretary has no delegates_for_user_id
    secretary_user.delegates_for_user_id = None
    db.commit()
    
    ctx = AgentContext(
        db=db,
        company_id=admin_user.company_id,
        user_id=admin_user.id,
        user_email=admin_user.email,
        user_role="admin",
        persona="admin",
    )
    
    result = _handle_audit_permissions(ctx, AuditPermissionsArgs(
        check_type="missing_assignments"
    ))
    
    assert result.ok
    assert len(result.data["findings"]) >= 1
    assert any(f["type"] == "secretary_without_boss" for f in result.data["findings"])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_admin_tools.py -v -k "test_audit_permissions"`
Expected: FAIL

- [ ] **Step 3: Define AuditPermissionsArgs and implement**

```python
# In packages/modules/agent/tools/admin_tools.py

class AuditPermissionsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    check_type: str = Field(..., pattern=r"^(role_capability_mismatch|missing_assignments|orphaned_data|module_gaps|all)$")


def _handle_audit_permissions(ctx: AgentContext, args: AuditPermissionsArgs) -> ToolResult:
    if ctx.user_role != "admin":
        return ToolResult(
            ok=False,
            summary="audit_permissions requires admin role",
            error="forbidden",
        )
    
    findings = []
    
    # Get all users
    users = (
        ctx.db.query(User)
        .filter(User.company_id == ctx.company_id)
        .all()
    )
    
    # Get company modules
    setup = (
        ctx.db.query(CompanySetup)
        .filter(CompanySetup.company_id == ctx.company_id)
        .first()
    )
    company_modules = {
        "accounting_module_enabled": setup.accounting_module_enabled if setup else True,
        "time_allocation_module_enabled": setup.time_allocation_module_enabled if setup else False,
        "amex_reconciliation_module_enabled": setup.amex_reconciliation_module_enabled if setup else False,
    }
    
    check_all = args.check_type == "all"
    
    # Check 1: Role capability mismatch
    if args.check_type in ("role_capability_mismatch", "all"):
        # Accountants without accounting access
        for u in users:
            if u.role == "accounting" and not u.can_access_accounting:
                findings.append({
                    "type": "accountant_without_accounting_access",
                    "user_id": u.id,
                    "email": u.email,
                    "role": u.role,
                    "suggestion": f"Set can_access_accounting=True for {u.email}",
                })
            
            # Executives without executive reporting
            if u.role == "executive" and not u.has_executive_reporting:
                findings.append({
                    "type": "executive_without_reporting",
                    "user_id": u.id,
                    "email": u.email,
                    "role": u.role,
                    "suggestion": f"Set has_executive_reporting=True for {u.email}",
                })
    
    # Check 2: Missing assignments
    if args.check_type in ("missing_assignments", "all"):
        # Secretaries without boss
        for u in users:
            if u.role == "secretary" and not u.delegates_for_user_id:
                findings.append({
                    "type": "secretary_without_boss",
                    "user_id": u.id,
                    "email": u.email,
                    "role": u.role,
                    "suggestion": f"Assign a boss for secretary {u.email}",
                })
        
        # Users with time tracking but no projects
        for u in users:
            if u.requires_time_tracking and company_modules.get("time_allocation_module_enabled"):
                # Check if user has projects
                from packages.core.platform.models_project import UserProject
                user_projects = (
                    ctx.db.query(UserProject)
                    .filter(UserProject.user_id == u.id)
                    .count()
                )
                if user_projects == 0:
                    findings.append({
                        "type": "time_tracking_without_projects",
                        "user_id": u.id,
                        "email": u.email,
                        "suggestion": f"Assign projects to {u.email} for time tracking",
                    })
    
    # Check 3: Orphaned data
    if args.check_type in ("orphaned_data", "all"):
        # Inactive users
        inactive = [u for u in users if not u.is_active]
        for u in inactive:
            findings.append({
                "type": "inactive_user",
                "user_id": u.id,
                "email": u.email,
                "suggestion": f"Consider reactivating or archiving {u.email}",
            })
    
    # Check 4: Module gaps
    if args.check_type in ("module_gaps", "all"):
        # Users with capabilities for disabled modules
        for u in users:
            if u.is_amex_reconciler and not company_modules.get("amex_reconciliation_module_enabled"):
                findings.append({
                    "type": "capability_for_disabled_module",
                    "user_id": u.id,
                    "email": u.email,
                    "capability": "is_amex_reconciler",
                    "module": "amex_reconciliation",
                    "suggestion": f"Disable is_amex_reconciler for {u.email} or enable the module",
                })
            
            if u.requires_time_tracking and not company_modules.get("time_allocation_module_enabled"):
                findings.append({
                    "type": "capability_for_disabled_module",
                    "user_id": u.id,
                    "email": u.email,
                    "capability": "requires_time_tracking",
                    "module": "time_allocation",
                    "suggestion": f"Disable requires_time_tracking for {u.email} or enable the module",
                })
    
    return ToolResult(
        ok=True,
        summary=f"Found {len(findings)} permission issues",
        data={
            "check_type": args.check_type,
            "findings": findings,
            "total_checked": len(users),
        },
    )


REGISTRY.register(ToolSpec(
    name="audit_permissions",
    description="Audita permisos y encuentra inconsistencias.",
    category="read",
    input_schema=AuditPermissionsArgs,
    handler=_handle_audit_permissions,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.admin",
))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_admin_tools.py -v -k "test_audit_permissions"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/modules/agent/tools/admin_tools.py tests/test_admin_tools.py
git commit -m "feat(agent): add audit_permissions tool"
```

---

## Task 6: Frontend - UserDetailPanel Component

**Files:**
- Create: `web/components/admin/UserDetailPanel.tsx`
- Modify: `web/components/admin/AdminUsersPanel.tsx`

**Goal:** Create slide-out detail panel with activity metrics and capability checklist.

- [ ] **Step 1: Create UserDetailPanel component**

```tsx
// Create web/components/admin/UserDetailPanel.tsx

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Mail,
  Building,
  Briefcase,
  Phone,
  Calendar,
  ToggleLeft,
  ToggleRight,
  Clock,
  Receipt,
  CheckCircle2,
  XCircle,
  AlertCircle,
  UserCog,
} from "lucide-react";
import type { UserFull, LegalEntity } from "@/types";

interface Props {
  user: UserFull;
  legalEntities: LegalEntity[];
  onSaved: (user: UserFull) => void;
  onBack: () => void;
}

export default function UserDetailPanel({ user, legalEntities, onSaved, onBack }: Props) {
  const tu = useTranslations("admin.users");
  const [saving, setSaving] = useState(false);

  // Capability groups with translations
  const capabilityGroups = [
    {
      title: tu("capGroupExpense"),
      capabilities: [
        { key: "can_create_expenses", label: tu("capCreateExpenses"), desc: tu("capCreateExpensesDesc") },
        { key: "can_create_corporate_expenses", label: tu("capCorporateExpenses"), desc: tu("capCorporateExpensesDesc") },
        { key: "can_invoice_corporation", label: tu("capInvoiceCorporation"), desc: tu("capInvoiceCorporationDesc") },
      ],
    },
    {
      title: tu("capGroupAccounting"),
      capabilities: [
        { key: "can_access_accounting", label: tu("capAccessAccounting"), desc: tu("capAccessAccountingDesc") },
        { key: "can_view_analytics", label: tu("capViewAnalytics"), desc: tu("capViewAnalyticsDesc") },
      ],
    },
    {
      title: tu("capGroupSpecial"),
      capabilities: [
        { key: "is_amex_reconciler", label: tu("capAmexReconciler"), desc: tu("capAmexReconcilerDesc") },
        { key: "requires_time_tracking", label: tu("capTimeTracking"), desc: tu("capTimeTrackingDesc") },
        { key: "has_executive_reporting", label: tu("capExecReporting"), desc: tu("capExecReportingDesc") },
      ],
    },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-subtle px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="text-muted hover:text-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${user.is_active ? "bg-emerald-400" : "bg-surface-2"}`} />
            <span className="text-sm font-semibold text-primary">{user.full_name}</span>
          </div>
          <p className="text-xs text-muted font-mono">{user.email}</p>
        </div>
        <span className="rounded border border-subtle px-2 py-0.5 text-[10px] font-medium text-secondary">
          {user.role}
        </span>
      </div>

      {/* Activity Metrics */}
      <div className="border-b border-subtle p-4">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted mb-3">
          {tu("activityMetrics")}
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-subtle bg-surface-1 p-3">
            <div className="flex items-center gap-2 text-muted">
              <Calendar className="h-3.5 w-3.5" />
              <span className="text-[9px] uppercase">{tu("lastLogin")}</span>
            </div>
            <p className="mt-1 text-sm font-medium text-primary">
              {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : "—"}
            </p>
          </div>
          <div className="rounded-lg border border-subtle bg-surface-1 p-3">
            <div className="flex items-center gap-2 text-muted">
              <Receipt className="h-3.5 w-3.5" />
              <span className="text-[9px] uppercase">{tu("lastExpense")}</span>
            </div>
            <p className="mt-1 text-sm font-medium text-primary">—</p>
          </div>
          <div className="rounded-lg border border-subtle bg-surface-1 p-3">
            <div className="flex items-center gap-2 text-muted">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-[9px] uppercase">{tu("created")}</span>
            </div>
            <p className="mt-1 text-sm font-medium text-primary">
              {new Date(user.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Capabilities */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted mb-3">
          {tu("capabilities")}
        </h3>
        
        {capabilityGroups.map((group) => (
          <div key={group.title} className="mb-4">
            <p className="text-[10px] font-semibold text-tertiary mb-2">{group.title}</p>
            <div className="space-y-1">
              {group.capabilities.map((cap) => {
                const value = user[cap.key as keyof UserFull] as boolean;
                return (
                  <div
                    key={cap.key}
                    className="flex items-center justify-between rounded border border-subtle bg-surface-1 px-3 py-2"
                  >
                    <div>
                      <p className="text-xs text-secondary">{cap.label}</p>
                      <p className="text-[9px] text-muted">{cap.desc}</p>
                    </div>
                    {value ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Delegation */}
        {user.role === "secretary" && (
          <div className="mb-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2">
              {tu("delegation")}
            </h3>
            <div className="rounded border border-subtle bg-surface-1 px-3 py-2">
              <p className="text-[9px] text-muted">{tu("delegatesFor")}</p>
              <p className="text-xs text-primary">
                {user.delegates_for_user_name || tu("noDelegation")}
              </p>
            </div>
          </div>
        )}

        {/* Company Assignment */}
        <div className="mb-4">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2">
            {tu("companyAssignment")}
          </h3>
          <div className="rounded border border-subtle bg-surface-1 px-3 py-2">
            <div className="flex items-center gap-2 text-muted mb-1">
              <Building className="h-3 w-3" />
              <span className="text-[9px] uppercase">{tu("legalEntity")}</span>
            </div>
            <p className="text-xs text-primary">
              {legalEntities.find((e) => e.id === user.legal_entity_id)?.entity_name || tu("unassigned")}
            </p>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="border-t border-subtle p-4">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded border border-default bg-surface-1 px-4 py-2 text-xs font-medium text-secondary hover:bg-surface-2"
        >
          <UserCog className="h-3.5 w-3.5" />
          {tu("editPermissions")}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add translation keys for UserDetailPanel**

Add to `web/messages/en.json`:

```json
{
  "admin": {
    "users": {
      "activityMetrics": "Activity Metrics",
      "lastLogin": "Last Login",
      "lastExpense": "Last Expense",
      "created": "Created",
      "capabilities": "Capabilities",
      "capGroupExpense": "Expense Access",
      "capGroupAccounting": "Accounting",
      "capGroupSpecial": "Special",
      "capCreateExpensesDesc": "Create and submit expense reports",
      "capCorporateExpensesDesc": "Create corporate card expenses",
      "capInvoiceCorporationDesc": "Invoice on behalf of the corporation",
      "capAccessAccountingDesc": "Access accounting review queue",
      "capViewAnalyticsDesc": "View finance analytics dashboard",
      "capAmexReconcilerDesc": "Reconcile AMEX statements",
      "capTimeTrackingDesc": "Track time on projects",
      "capExecReportingDesc": "Access executive analytics dashboard",
      "delegation": "Delegation",
      "delegatesFor": "Submits expenses for",
      "noDelegation": "No boss assigned",
      "companyAssignment": "Company Assignment",
      "legalEntity": "Legal Entity",
      "unassigned": "Unassigned",
      "editPermissions": "Edit Permissions"
    }
  }
}
```

Add to `web/messages/es.json`:

```json
{
  "admin": {
    "users": {
      "activityMetrics": "Métricas de Actividad",
      "lastLogin": "Último Acceso",
      "lastExpense": "Último Gasto",
      "created": "Creado",
      "capabilities": "Capacidades",
      "capGroupExpense": "Acceso a Gastos",
      "capGroupAccounting": "Contabilidad",
      "capGroupSpecial": "Especial",
      "capCreateExpensesDesc": "Crear y enviar reportes de gastos",
      "capCorporateExpensesDesc": "Crear gastos de tarjeta corporativa",
      "capInvoiceCorporationDesc": "Facturar en nombre de la corporación",
      "capAccessAccountingDesc": "Acceder a la cola de revisión contable",
      "capViewAnalyticsDesc": "Ver panel de analíticas financieras",
      "capAmexReconcilerDesc": "Conciliar estados de cuenta AMEX",
      "capTimeTrackingDesc": "Registrar tiempo en proyectos",
      "capExecReportingDesc": "Acceder al panel de analíticas ejecutivas",
      "delegation": "Delegación",
      "delegatesFor": "Envía gastos por",
      "noDelegation": "Sin jefe asignado",
      "companyAssignment": "Asignación de Compañía",
      "legalEntity": "Entidad Legal",
      "unassigned": "Sin asignar",
      "editPermissions": "Editar Permisos"
    }
  }
}
```

- [ ] **Step 3: Update AdminUsersPanel to use UserDetailPanel**

This step modifies `web/components/admin/AdminUsersPanel.tsx` to integrate the detail panel. The existing file is large, so we add the detail panel integration:

```tsx
// Add to the existing AdminUsersPanel component:
// 1. Add state for selected user
// 2. Add UserDetailPanel render condition
// 3. Update row click handler

// In the component state section:
const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
const selectedUser = selectedUserId ? users.find((u) => u.id === selectedUserId) : null;

// In the render section, replace the user list with:
{selectedUser ? (
  <UserDetailPanel
    user={selectedUser}
    legalEntities={legalEntities}
    onSaved={handleSaved}
    onBack={() => setSelectedUserId(null)}
  />
) : (
  // Existing user list
)}
```

- [ ] **Step 4: Run build to verify compilation**

Run: `cd web && npm run build`
Expected: PASS with no TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add web/components/admin/UserDetailPanel.tsx web/components/admin/AdminUsersPanel.tsx web/messages/en.json web/messages/es.json
git commit -m "feat(admin): add UserDetailPanel with capability checklist"
```

---

## Task 7: Admin Navigation Test (Acceptance)

**Goal:** Verify Admin navigation shows Settings and Operations sections correctly.

- [ ] **Step 1: Run dev server and verify navigation**

Run: `cd web && npm run dev`
Navigate to: `http://localhost:3000/admin`

**Expected navigation structure:**

Settings section:
- Onboarding (hidden if completed)
- Company Setup
- Expense Policy
- Workflow
- Users/Roles
- Accounting Setup
- Integrations
- Platform API
- Export

Operations section:
- Audit Log
- CFDI Watcher
- Notifications

- [ ] **Step 2: Verify translations are applied**

Check that all navigation labels are translated in Spanish and English.

- [ ] **Step 3: Commit verification**

```bash
git status
# All changes should be committed
```

---

## Summary

This implementation plan covers:

1. **Backend Tools** (Tasks 1-5): list_users, get_user_permissions, create_user, update_user_permissions, audit_permissions
2. **Frontend Components** (Task 6): UserDetailPanel with capability checklist
3. **Acceptance Test** (Task 7): Admin navigation verification

Each task follows TDD principles with tests written before implementation. The plan is designed for incremental delivery - each task produces working, testable software.