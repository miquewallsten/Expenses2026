"use client";

import AdminPoliciesPanel from "./AdminPoliciesPanel";

interface Props {
  companyId: number;
  companySetup?: Record<string, any>;
  expensePolicy: Record<string, any>;
  approvalSetup?: Record<string, any>;
  accountingSetup?: Record<string, any>;
  onExpensePolicySaved: (p: Record<string, any>) => void;
  onApprovalSetupSaved?: (p: Record<string, any>) => void;
  expensePolicyDraftPatch?: Partial<Record<string, any>>;
  approvalDraftPatch?: Partial<Record<string, any>>;
}

export default function AdminRulesStudio(props: Props) {
  return (
    <AdminPoliciesPanel
      companyId={props.companyId}
      expensePolicy={props.expensePolicy}
      onExpensePolicySaved={props.onExpensePolicySaved}
      draftPatch={props.expensePolicyDraftPatch}
    />
  );
}
