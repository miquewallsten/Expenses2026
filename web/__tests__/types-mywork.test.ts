import { describe, it, expect } from "vitest";
import {
  MYWORK_TYPES_VERSION,
  type ModuleDefinition,
  type AgentCapability,
  type ProactiveTrigger,
  type PermissionManifest,
  type ModulePermission,
  type ActionRequest,
  type ActionContext,
  type AgentInvocation,
  type ActionResponse,
} from "@/types/mywork";

describe("MyWork types", () => {
  it("exports version constant", () => {
    expect(MYWORK_TYPES_VERSION).toBe("1.0.0");
  });

  it("ModuleDefinition accepts valid object", () => {
    const mod: ModuleDefinition = {
      id: "expenses",
      name: "Expenses",
      icon: "Receipt",
      requiredPermissions: ["expense:create", "expense:read"],
      requiredRoles: ["employee", "manager"],
      agentCapabilities: [],
      routePattern: "/expenses",
      sidebarGroup: "operations",
      defaultForRoles: ["employee"],
    };
    expect(mod.id).toBe("expenses");
    expect(mod.sidebarGroup).toBe("operations");
  });

  it("AgentCapability accepts valid object", () => {
    const cap: AgentCapability = {
      action: "categorize",
      description: "Auto-categorize expenses",
      requiredPermissions: ["expense:categorize"],
      proactiveTriggers: [
        {
          condition: "new_expense",
          messageTemplate: "A new expense needs categorization",
          frequency: "realtime",
        },
      ],
    };
    expect(cap.action).toBe("categorize");
    expect(cap.proactiveTriggers[0].frequency).toBe("realtime");
  });

  it("ProactiveTrigger accepts all frequency values", () => {
    const once: ProactiveTrigger = {
      condition: "onboarding",
      messageTemplate: "Welcome!",
      frequency: "once",
    };
    const daily: ProactiveTrigger = {
      condition: "reminder",
      messageTemplate: "Daily reminder",
      frequency: "daily",
    };
    expect(once.frequency).toBe("once");
    expect(daily.frequency).toBe("daily");
  });

  it("PermissionManifest accepts valid object", () => {
    const manifest: PermissionManifest = {
      user: {
        id: 1,
        email: "user@example.com",
        fullName: "Test User",
        role: "employee",
        isSuperAdmin: false,
      },
      permissions: ["expense:create"],
      modules: [
        {
          moduleId: "expenses",
          enabled: true,
          permissions: ["expense:create"],
          features: ["cfdi"],
        },
      ],
      copilot: {
        enabled: true,
        agentId: "accounting-agent",
        proactiveNotifications: true,
        allowedTools: ["read_expenses", "categorize"],
      },
      tenant: {
        id: 1,
        name: "Acme Corp",
        config: { timezone: "America/Mexico_City" },
      },
    };
    expect(manifest.user.id).toBe(1);
    expect(manifest.copilot.enabled).toBe(true);
    expect(manifest.tenant.name).toBe("Acme Corp");
  });

  it("ModulePermission accepts valid object", () => {
    const mp: ModulePermission = {
      moduleId: "expenses",
      enabled: true,
      permissions: ["expense:create"],
      features: ["cfdi", "amex"],
    };
    expect(mp.moduleId).toBe("expenses");
    expect(mp.features).toContain("cfdi");
  });

  it("ActionRequest accepts valid object", () => {
    const req: ActionRequest = {
      actionId: "submit-expense",
      module: "expenses",
      payload: { amount: 100 },
      context: {
        userId: 1,
        companyId: 1,
        role: "employee",
        permissions: ["expense:create"],
        sessionId: "sess-123",
        moduleContext: { source: "web" },
      },
      agentInvocation: {
        agentId: "expense-agent",
        toolCallId: "tool-1",
        reasoning: "User submitted expense",
      },
    };
    expect(req.actionId).toBe("submit-expense");
    expect(req.context.userId).toBe(1);
  });

  it("ActionContext accepts valid object", () => {
    const ctx: ActionContext = {
      userId: 1,
      companyId: 1,
      role: "manager",
      permissions: ["expense:approve"],
      sessionId: "sess-456",
      moduleContext: { stage: "approval" },
    };
    expect(ctx.role).toBe("manager");
  });

  it("AgentInvocation accepts valid object", () => {
    const inv: AgentInvocation = {
      agentId: "accounting-agent",
      toolCallId: "tc-789",
      reasoning: "Matched by category rules",
    };
    expect(inv.agentId).toBe("accounting-agent");
  });

  it("ActionResponse success accepts valid object", () => {
    const res: ActionResponse = {
      success: true,
      data: { id: 42 },
    };
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ id: 42 });
  });

  it("ActionResponse error accepts valid object", () => {
    const res: ActionResponse = {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Permission denied",
        retryable: false,
      },
    };
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe("UNAUTHORIZED");
    expect(res.error?.retryable).toBe(false);
  });
});
