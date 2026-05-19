/**
 * Shared types for the EmployeeExpenseDetail component tree.
 * Extracted from EmployeeExpenseDetail.tsx for reusability.
 */

export interface Expense {
  id: number;
  description: string;
  amount: number;
  status: string;
  detected_category: string | null;
  account_code: string | null;
  category_code: string | null;
  report_id: number | null;
  expense_date: string | null;
  created_at: string;
  notes?: string | null;
  tags?: string | null;        // JSON array string
  expense_type?: string | null;
}

export interface OrgUnit {
  id: number;
  name: string;
  code: string;
}

export interface PredefinedTag {
  id: number;
  name: string;
  color: string | null;
}

export interface AccountingCategoryRow {
  id: number;
  code: string;
  name: string;
  tax_behavior: string;
  requires_project: boolean;
  is_active: boolean;
}

export interface AllocationRead {
  id: number;
  expense_id: number;
  project_id: number | null;
  client_id: number | null;
  cost_center_id: number | null;
  percent: number;
}

export interface AllocationRow {
  project_id: number | null;
  client_id: number | null;
  cost_center_id: number | null;
  percent: string;
}

export interface UploadEntry {
  localId: string;
  filename: string;
  status: "uploading" | "done" | "error";
}

export interface EmployeeActions {
  can_edit: boolean;
  can_delete: boolean;
  can_submit: boolean;
  can_resubmit: boolean;
  can_add_documents: boolean;
}

export interface ValidationResultRow {
  code: string;
  status: "passed" | "warning" | "failed" | "not_run";
  message: string;
  group: string;
  overridden: boolean;
  override_note: string | null;
  overridden_at: string | null;
  overridden_by: number | null;
}

export interface PolicyCheckRow {
  code: string;
  status: "passed" | "warning" | "failed" | "not_run";
  message: string;
  group: string;
  overridden: boolean;
  override_note: string | null;
  overridden_at: string | null;
  overridden_by: number | null;
  timestamp: string | null;
}

export interface AllocationSummaryResult {
  total: number;
  allocated: number;
  unallocated: number;
}

export interface BlockersResult {
  blockers: string[];
  label: string;
  ok: boolean;
}
