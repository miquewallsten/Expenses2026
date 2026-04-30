export const MYWORK_TYPES_VERSION = "1.0.0";

export interface ModuleDefinition {
  id: string;
  name: string;
  icon: string;
  requiredPermissions: string[];
  requiredRoles: string[];
  agentCapabilities: AgentCapability[];
  routePattern: string;
  sidebarGroup: string;
  defaultForRoles: string[];
}

export interface AgentCapability {
  action: string;
  description: string;
  requiredPermissions: string[];
  proactiveTriggers: ProactiveTrigger[];
}

export type ProactiveFrequency = "once" | "daily" | "realtime";

export interface ProactiveTrigger {
  condition: string;
  messageTemplate: string;
  frequency: ProactiveFrequency;
}

export interface PermissionManifest {
  user: {
    id: number;
    email: string;
    fullName: string;
    role: string;
    isSuperAdmin: boolean;
  };
  permissions: string[];
  modules: ModulePermission[];
  copilot: {
    enabled: boolean;
    agentId: string;
    proactiveNotifications: boolean;
    allowedTools: string[];
  };
  tenant: {
    id: number;
    name: string;
    config: Record<string, unknown>;
  };
}

export interface ModulePermission {
  moduleId: string;
  enabled: boolean;
  permissions: string[];
  features: string[];
}

export interface ActionRequest {
  actionId: string;
  module: string;
  payload: Record<string, unknown>;
  context: ActionContext;
  agentInvocation?: AgentInvocation;
}

export interface ActionContext {
  userId: number;
  companyId: number;
  role: string;
  permissions: string[];
  sessionId: string;
  moduleContext: Record<string, unknown>;
}

export interface AgentInvocation {
  agentId: string;
  toolCallId: string;
  reasoning: string;
}

export interface ActionResponseError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ActionResponse {
  success: boolean;
  data?: Record<string, unknown>;
  error?: ActionResponseError;
}
