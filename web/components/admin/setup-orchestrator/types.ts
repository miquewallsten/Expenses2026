/**
 * Shared types for the AdminSetupOrchestratorPanel component tree.
 * Extracted from AdminSetupOrchestratorPanel.tsx for reusability.
 */

export interface CompanyProfile {
  company_type: string;
  complexity: "simple" | "medium" | "complex";
  notes: string[];
}

export interface DetectedConflict {
  code: string;
  message: string;
  severity: "warning" | "critical";
}

export interface MissingDecision {
  key: string;
  question: string;
  suggested_options: string[];
}

export interface SuggestedPatches {
  company_setup: Record<string, any>;
  expense_policy: Record<string, any>;
  accounting_setup: Record<string, any>;
  approval_setup: Record<string, any>;
  workflow_setup: Record<string, any>;
}

export interface GeneratedCategory {
  code: string;
  expense_account_code?: string | null;
  requires_project?: boolean;
}

export type ExecutableActionType =
  | "create_user"
  | "bulk_invite_users"
  | "create_accounting_category"
  | "bulk_create_accounting_categories"
  | "update_user_role";

export interface ExecutableAction {
  action_id: string;
  action_type: ExecutableActionType;
  label: string;
  params: Record<string, any>;
  requires_confirmation?: boolean;
}

export interface AnalyzeResponse {
  company_profile?: CompanyProfile;
  detected_conflicts?: DetectedConflict[];
  missing_decisions?: MissingDecision[];
  suggested_patches?: SuggestedPatches;
  generated_categories?: GeneratedCategory[];
  executable_actions?: ExecutableAction[];
  summary?: string;
  next_steps?: string[];
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  analysis?: AnalyzeResponse | null;
  drafts: Record<string, Record<string, any>>;
  executions: Record<string, { status: "running" | "done" | "error"; error?: string }>;
  collapsed?: boolean;
}
