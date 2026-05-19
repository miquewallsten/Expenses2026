/**
 * Centralized status style maps
 * Single source of truth for status badge/indicator styling across all modules.
 * Uses the 12% background + 30% border formula from DESIGN.md.
 */

export type ExpenseStatus = "draft" | "submitted" | "manager_approved" | "approved" | "rejected" | "cancelled" | "pending_review";
export type RequestStatus = "draft" | "submitted" | "in_review" | "approved" | "rejected" | "cancelled";
export type WorkflowStageStatus = "inactive" | "active" | "completed" | "rejected" | "skipped";

/** Expense/approval status styles - used by MyExpenses, MyApprovals, AccountingReview */
export const EXPENSE_STATUS_STYLES: Record<string, { bg: string; text: string; border?: string; dot?: string }> = {
  draft: { bg: "bg-surface-2", text: "text-secondary", dot: "bg-zinc-500" },
  submitted: { bg: "bg-accent-muted", text: "text-accent", border: "border-accent/30", dot: "bg-blue-400" },
  pending_review: { bg: "bg-amber-500/12", text: "text-amber-400", border: "border-amber-500/30", dot: "bg-amber-400" },
  manager_approved: { bg: "bg-violet-500/12", text: "text-violet-400", border: "border-violet-500/30", dot: "bg-violet-400" },
  approved: { bg: "bg-emerald-500/12", text: "text-emerald-400", border: "border-emerald-500/30", dot: "bg-emerald-400" },
  rejected: { bg: "bg-error-muted", text: "text-error", border: "border-error/30", dot: "bg-red-400" },
  cancelled: { bg: "bg-surface-2", text: "text-muted", border: "border-subtle", dot: "bg-zinc-600" },
};

/** Purchase request status styles */
export const REQUEST_STATUS_STYLES: Record<string, { bg: string; text: string; border?: string }> = {
  draft: { bg: "bg-surface-2", text: "text-secondary" },
  submitted: { bg: "bg-accent-muted", text: "text-accent", border: "border-accent/30" },
  in_review: { bg: "bg-amber-500/12", text: "text-amber-400", border: "border-amber-500/30" },
  approved: { bg: "bg-emerald-500/12", text: "text-emerald-400", border: "border-emerald-500/30" },
  rejected: { bg: "bg-error-muted", text: "text-error", border: "border-error/30" },
  cancelled: { bg: "bg-surface-2", text: "text-muted" },
};

/** Workflow stage status styles */
export const WORKFLOW_STATUS_STYLES: Record<string, { bg: string; text: string; border?: string }> = {
  inactive: { bg: "bg-surface-2", text: "text-muted" },
  active: { bg: "bg-accent-muted", text: "text-accent", border: "border-accent/30" },
  completed: { bg: "bg-emerald-500/12", text: "text-emerald-400", border: "border-emerald-500/30" },
  rejected: { bg: "bg-error-muted", text: "text-error", border: "border-error/30" },
  skipped: { bg: "bg-surface-2", text: "text-muted" },
};

/** Generic status tone mapping for analytics / finance modules */
export const STATUS_TONE_STYLES: Record<string, { bg: string; text: string }> = {
  success: { bg: "bg-emerald-500/12", text: "text-emerald-400" },
  warning: { bg: "bg-amber-500/12", text: "text-amber-400" },
  error: { bg: "bg-error-muted", text: "text-error" },
  info: { bg: "bg-accent-muted", text: "text-accent" },
  neutral: { bg: "bg-surface-2", text: "text-secondary" },
  muted: { bg: "bg-surface-2", text: "text-muted" },
};

/** Helper to build a status badge className from a status key */
export function statusClasses(status: string, map: Record<string, { bg: string; text: string; border?: string }> = EXPENSE_STATUS_STYLES): string {
  const s = map[status] ?? map.neutral ?? { bg: "bg-surface-2", text: "text-muted" };
  return [s.bg, s.text, s.border ?? "border-transparent"].join(" ");
}
