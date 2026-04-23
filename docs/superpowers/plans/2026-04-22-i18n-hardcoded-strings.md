# i18n Hardcoded String Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all 261 hardcoded English display strings across 15 frontend files with `next-intl` translation keys, with Spanish MX as the primary locale and English as backup.

**Architecture:** Each component gets its hardcoded strings extracted into `web/messages/es.json` (primary) and `web/messages/en.json` (backup) under the appropriate namespace. Components call `t("keyName")` via `useTranslations`. JSON files must stay valid and in perfect sync after every task.

**Tech Stack:** Next.js 16, next-intl, TypeScript — no new dependencies.

---

### Task 1: AdminSetupOrchestratorPanel.tsx (50 strings)

**Files:**
- Modify: `web/components/admin/AdminSetupOrchestratorPanel.tsx`
- Modify: `web/messages/es.json` — namespace `admin.setupOrchestrator`
- Modify: `web/messages/en.json` — namespace `admin.setupOrchestrator`

- [ ] Read the file, identify all hardcoded user-visible strings
- [ ] Add `admin.setupOrchestrator` namespace to `es.json` with Spanish MX values
- [ ] Add matching keys to `en.json` with English values
- [ ] Replace every hardcoded string in the component with `t("keyName")`
- [ ] Ensure `useTranslations("admin.setupOrchestrator")` is present
- [ ] Verify both JSON files are valid: `python3 -m json.tool web/messages/es.json > /dev/null`

---

### Task 2: AdminCompanySetupCopilot.tsx (39 strings)

**Files:**
- Modify: `web/components/admin/AdminCompanySetupCopilot.tsx`
- Modify: `web/messages/es.json` — namespace `admin.companySetup` (may already exist — extend it)
- Modify: `web/messages/en.json` — namespace `admin.companySetup`

- [ ] Read the file, identify all hardcoded user-visible strings
- [ ] Extend or create `admin.companySetup` namespace in both JSON files
- [ ] Replace hardcoded strings with `t("keyName")`
- [ ] Verify JSON validity

---

### Task 3: admin/page.tsx (28 strings)

**Files:**
- Modify: `web/app/admin/page.tsx`
- Modify: `web/messages/es.json` — namespace `admin` (extend existing)
- Modify: `web/messages/en.json` — namespace `admin`

- [ ] Read the file, identify all hardcoded strings (section titles, labels, tab names)
- [ ] Extend `admin` namespace in both JSON files
- [ ] Replace with `t("keyName")` — ensure `useTranslations("admin")` is imported
- [ ] Verify JSON validity

---

### Task 4: AdminQuickPoliciesPanel.tsx (25 strings)

**Files:**
- Modify: `web/components/admin/AdminQuickPoliciesPanel.tsx`
- Modify: `web/messages/es.json` — namespace `admin.quickPolicies`
- Modify: `web/messages/en.json` — namespace `admin.quickPolicies`

- [ ] Read the file, identify hardcoded strings (policy labels, descriptions, options)
- [ ] Add namespace to both JSON files
- [ ] Replace with `t("keyName")`
- [ ] Verify JSON validity

---

### Task 5: XmlDetailModal.tsx (22 strings)

**Files:**
- Modify: `web/components/employee/XmlDetailModal.tsx`
- Modify: `web/messages/es.json` — namespace `employee.xmlDetail` (may already exist — extend)
- Modify: `web/messages/en.json` — namespace `employee.xmlDetail`

- [ ] Read the file, identify hardcoded strings (field labels: RFC, UUID, importe, etc. — use SAT terminology in Spanish MX)
- [ ] Add/extend namespace in both JSON files
- [ ] Replace with `t("keyName")`
- [ ] Verify JSON validity

---

### Task 6: AdminWorkflowCopilot.tsx (14 strings)

**Files:**
- Modify: `web/components/admin/AdminWorkflowCopilot.tsx`
- Modify: `web/messages/es.json` — namespace `admin.workflowSetup` (extend)
- Modify: `web/messages/en.json` — namespace `admin.workflowSetup`

- [ ] Read the file, identify hardcoded strings
- [ ] Add/extend namespace in both JSON files
- [ ] Replace with `t("keyName")`
- [ ] Verify JSON validity

---

### Task 7: AdminCompanySetupStudio.tsx (14 strings)

**Files:**
- Modify: `web/components/admin/AdminCompanySetupStudio.tsx`
- Modify: `web/messages/es.json` — namespace `admin.companySetup` (extend)
- Modify: `web/messages/en.json` — namespace `admin.companySetup`

- [ ] Read the file, identify hardcoded strings
- [ ] Extend namespace in both JSON files
- [ ] Replace with `t("keyName")`
- [ ] Verify JSON validity

---

### Task 8: AdminApprovalCopilot.tsx (14 strings)

**Files:**
- Modify: `web/components/admin/AdminApprovalCopilot.tsx`
- Modify: `web/messages/es.json` — namespace `admin.approvalSetup` (extend)
- Modify: `web/messages/en.json` — namespace `admin.approvalSetup`

- [ ] Read the file, identify hardcoded strings (approval mode labels, threshold labels, rule descriptions)
- [ ] Extend namespace in both JSON files
- [ ] Replace with `t("keyName")`
- [ ] Verify JSON validity

---

### Task 9: AdminAccountingCopilot.tsx (13 strings)

**Files:**
- Modify: `web/components/admin/AdminAccountingCopilot.tsx`
- Modify: `web/messages/es.json` — namespace `admin.accountingSetup` (extend)
- Modify: `web/messages/en.json` — namespace `admin.accountingSetup`

- [ ] Read the file, identify hardcoded strings
- [ ] Extend namespace in both JSON files
- [ ] Replace with `t("keyName")`
- [ ] Verify JSON validity

---

### Task 10: purchases/page.tsx (9 strings)

**Files:**
- Modify: `web/app/purchases/page.tsx`
- Modify: `web/messages/es.json` — check existing namespace
- Modify: `web/messages/en.json`

- [ ] Read the file, identify hardcoded strings
- [ ] Add/extend namespace in both JSON files
- [ ] Replace with `t("keyName")`
- [ ] Verify JSON validity

---

### Task 11: AdminUsersPanel.tsx (8 strings)

**Files:**
- Modify: `web/components/admin/AdminUsersPanel.tsx`
- Modify: `web/messages/es.json` — namespace `admin` (extend)
- Modify: `web/messages/en.json`

- [ ] Read the file, identify hardcoded strings
- [ ] Extend namespace in both JSON files
- [ ] Replace with `t("keyName")`
- [ ] Verify JSON validity

---

### Task 12: AdminConfigReviewPanel.tsx (6 strings)

**Files:**
- Modify: `web/components/admin/AdminConfigReviewPanel.tsx`
- Modify: `web/messages/es.json` — namespace `admin` (extend)
- Modify: `web/messages/en.json`

- [ ] Read the file — key strings: "Expense rules", "Approval chain", "Accounting", "Workflow", "Modules", "Subcontractors"
- [ ] Add keys to both JSON files
- [ ] Replace with `t("keyName")`
- [ ] Verify JSON validity

---

### Task 13: timesheets/page.tsx (6 strings)

**Files:**
- Modify: `web/app/timesheets/page.tsx`
- Modify: `web/messages/es.json`
- Modify: `web/messages/en.json`

- [ ] Read the file, identify hardcoded strings
- [ ] Add/extend namespace in both JSON files
- [ ] Replace with `t("keyName")`
- [ ] Verify JSON validity

---

### Task 14: ReviewQueueList.tsx (5 strings)

**Files:**
- Modify: `web/components/review/ReviewQueueList.tsx`
- Modify: `web/messages/es.json` — namespace `review` (extend)
- Modify: `web/messages/en.json`

- [ ] Read the file, identify hardcoded strings
- [ ] Extend namespace in both JSON files
- [ ] Replace with `t("keyName")`
- [ ] Verify JSON validity

---

### Task 15: time-admin/page.tsx (5 strings)

**Files:**
- Modify: `web/app/time-admin/page.tsx`
- Modify: `web/messages/es.json`
- Modify: `web/messages/en.json`

- [ ] Read the file — key strings: "Active", "Inactive", "On Hold", "Completed", "Team Member", "Lead", "Coordinator"
- [ ] Add/extend namespace in both JSON files
- [ ] Replace with `t("keyName")`
- [ ] Verify JSON validity

---

### Task 16: Final verification

- [ ] Run `python3 -m json.tool web/messages/es.json > /dev/null && echo "ES valid"`
- [ ] Run `python3 -m json.tool web/messages/en.json > /dev/null && echo "EN valid"`
- [ ] Run key parity check — zero drift between files
- [ ] Run `python -m pytest tests/ -x -q` — all 7 tests pass
- [ ] Run `/i18n audit` — hardcoded strings count should be near zero
