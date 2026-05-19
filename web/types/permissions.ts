/**
 * Auto-generated permission keys from packages/core/platform/service_permissions.py
 * DO NOT EDIT MANUALLY — run: python3 scripts/generate_permission_types.py
 */

export type PermissionKey =
  | "accounting:configure"
  | "accounting:export_polizas"
  | "accounting:work"
  | "admin"
  | "admin:ai_policy:read"
  | "admin:ai_policy:write"
  | "admin:approval_policy:write"
  | "admin:audit:read"
  | "admin:channels:read"
  | "admin:channels:write"
  | "admin:clients:write"
  | "admin:company:read"
  | "admin:company:write"
  | "admin:cost_centers:write"
  | "admin:integrations:read"
  | "admin:integrations:write"
  | "admin:legal_entities:write"
  | "admin:onboarding:write"
  | "admin:projects:write"
  | "admin:roles:read"
  | "admin:roles:write"
  | "admin:setup:write"
  | "admin:users:create"
  | "admin:users:delete"
  | "admin:users:read"
  | "admin:users:update"
  | "agent:chat:accounting"
  | "agent:chat:admin"
  | "agent:chat:employee"
  | "agent:insights:run"
  | "agent:tools:ai_policy"
  | "agent:tools:config"
  | "agent:tools:finance_copilot"
  | "agent:tools:infra"
  | "agent:tools:rbac"
  | "agent:tools:settings"
  | "amex:reconcile"
  | "amex:upload_statement"
  | "analytics:export"
  | "analytics:view"
  | "cfdi:pair"
  | "cfdi:recheck"
  | "document:delete"
  | "document:read:any"
  | "document:read:own"
  | "document:upload"
  | "expense:approve:accounting"
  | "expense:approve:manager"
  | "expense:bulk_transition"
  | "expense:create"
  | "expense:create:any"
  | "expense:delete:any"
  | "expense:delete:own"
  | "expense:export"
  | "expense:override_policy"
  | "expense:read:any"
  | "expense:read:company"
  | "expense:read:own"
  | "expense:reject"
  | "expense:submit"
  | "expense:update:any"
  | "expense:update:own"
  | "platform:api_keys:write"
  | "platform:webhooks:write"
  | "purchase_request:create:any"
  | "purchase_request:read:any"
  | "reports:build"
  | "time_tracking:submit";

/** Every permission key as a readonly array for runtime checks */
export const PERMISSION_KEYS: readonly PermissionKey[] = [
  "accounting:configure",
  "accounting:export_polizas",
  "accounting:work",
  "admin",
  "admin:ai_policy:read",
  "admin:ai_policy:write",
  "admin:approval_policy:write",
  "admin:audit:read",
  "admin:channels:read",
  "admin:channels:write",
  "admin:clients:write",
  "admin:company:read",
  "admin:company:write",
  "admin:cost_centers:write",
  "admin:integrations:read",
  "admin:integrations:write",
  "admin:legal_entities:write",
  "admin:onboarding:write",
  "admin:projects:write",
  "admin:roles:read",
  "admin:roles:write",
  "admin:setup:write",
  "admin:users:create",
  "admin:users:delete",
  "admin:users:read",
  "admin:users:update",
  "agent:chat:accounting",
  "agent:chat:admin",
  "agent:chat:employee",
  "agent:insights:run",
  "agent:tools:ai_policy",
  "agent:tools:config",
  "agent:tools:finance_copilot",
  "agent:tools:infra",
  "agent:tools:rbac",
  "agent:tools:settings",
  "amex:reconcile",
  "amex:upload_statement",
  "analytics:export",
  "analytics:view",
  "cfdi:pair",
  "cfdi:recheck",
  "document:delete",
  "document:read:any",
  "document:read:own",
  "document:upload",
  "expense:approve:accounting",
  "expense:approve:manager",
  "expense:bulk_transition",
  "expense:create",
  "expense:create:any",
  "expense:delete:any",
  "expense:delete:own",
  "expense:export",
  "expense:override_policy",
  "expense:read:any",
  "expense:read:company",
  "expense:read:own",
  "expense:reject",
  "expense:submit",
  "expense:update:any",
  "expense:update:own",
  "platform:api_keys:write",
  "platform:webhooks:write",
  "purchase_request:create:any",
  "purchase_request:read:any",
  "reports:build",
  "time_tracking:submit",
] as const;
