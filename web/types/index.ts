/**
 * Central type re-export for the web frontend.
 *
 * Import from "@/types" instead of individual files for shared types.
 * Context-specific types (like MyWorkContextValue) remain in their context files.
 */

// Portal configuration types
export type {
  ExpensePolicy,
  PortalDerived,
  PortalConfig,
  PortalConfigConflict,
} from "./portal";

// User types
export type { UserRole, UserCapabilities } from "./user";
export { DEFAULT_USER_CAPABILITIES } from "./user";

// Module types
export type {
  ModuleVisibilityContext,
  MyWorkModule,
  SelectedWorkItem,
} from "./modules";
export { EMPTY_SELECTED_WORK_ITEM } from "./modules";

// Agent / Action types (from mywork.ts)
export type {
  ModuleDefinition,
  AgentCapability,
  ProactiveFrequency,
  ProactiveTrigger,
  ManifestModule,
  PermissionManifest,
  ModulePermission,
  ActionRequest,
  ActionContext,
  AgentInvocation,
  ActionResponseError,
  ActionResponse,
} from "./mywork";

// Onboarding types
export type {
  OnboardingStep,
  ModuleType,
  CompanyProfile,
  ApprovalStage,
  ModuleConfig,
  ModuleQuestion,
  ModuleDefinition as OnboardingModuleDefinition,
  OnboardingState,
} from "./onboarding";
export {
  MODULE_DEFINITIONS,
  DEFAULT_COMPANY_PROFILE,
  DEFAULT_MODULE_CONFIG,
  STEP_ORDER,
} from "./onboarding";