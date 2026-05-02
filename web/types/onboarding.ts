/**
 * Onboarding Wizard Types
 * Phase 5: Admin Onboarding Wizard for Enterprise App
 */

export type OnboardingStep =
  | "welcome"
  | "company-profile"
  | "select-modules"
  | "configure-module"
  | "review";

export type ModuleType =
  | "expenses"
  | "timesheets"
  | "requests"
  | "accounting"
  | "ai";

export interface CompanyProfile {
  name: string;
  currency: string;
  timezone: string;
  industry?: string;
  country?: string;
}

export interface ApprovalStage {
  id: string;
  name: string;
  order: number;
  approverType: "manager" | "specific_user" | "role";
}

export interface ModuleConfig {
  enabled: boolean;
  approvalStages: ApprovalStage[];
  settings: Record<string, unknown>;
}

export interface ModuleQuestion {
  id: string;
  question: string;
  options: { value: string; label: string }[];
  default: string;
  configKey: string;
}

export interface ModuleDefinition {
  type: ModuleType;
  name: string;
  description: string;
  icon: string;
  questions: ModuleQuestion[];
}

export interface OnboardingState {
  currentStep: OnboardingStep;
  companyProfile: CompanyProfile;
  selectedModules: ModuleType[];
  moduleConfigs: Record<ModuleType, ModuleConfig>;
  activeModuleConfig: ModuleType | null;
  completedSteps: OnboardingStep[];
}

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  {
    type: "expenses",
    name: "Expenses",
    description: "Expense reporting, CFDI processing, and reimbursements",
    icon: "Receipt",
    questions: [
      {
        id: "exp-approval",
        question: "What approval workflow do you need for expenses?",
        options: [
          { value: "none", label: "No approval (direct submission)" },
          { value: "manager", label: "Manager approval only" },
          { value: "manager-accounting", label: "Manager + Accounting approval" },
          { value: "multi", label: "Multi-level approval chain" },
        ],
        default: "manager",
        configKey: "approvalMode",
      },
      {
        id: "exp-xml",
        question: "Do you require CFDI (XML) for expense validation?",
        options: [
          { value: "required", label: "Required for all expenses" },
          { value: "optional", label: "Optional (receipts accepted)" },
          { value: "none", label: "Not needed" },
        ],
        default: "optional",
        configKey: "xmlRequired",
      },
      {
        id: "exp-policy",
        question: "Should policy violations block submission?",
        options: [
          { value: "block", label: "Block submission on violations" },
          { value: "warn", label: "Warn but allow submission" },
          { value: "allow", label: "No policy enforcement" },
        ],
        default: "warn",
        configKey: "policyMode",
      },
    ],
  },
  {
    type: "timesheets",
    name: "Timesheets",
    description: "Time tracking by project and activity",
    icon: "Clock",
    questions: [
      {
        id: "ts-approval",
        question: "Do timesheets require approval?",
        options: [
          { value: "none", label: "No approval needed" },
          { value: "manager", label: "Manager approval" },
          { value: "project-manager", label: "Project manager approval" },
        ],
        default: "manager",
        configKey: "approvalMode",
      },
      {
        id: "ts-projects",
        question: "Is time tracking tied to projects?",
        options: [
          { value: "required", label: "Project required for all entries" },
          { value: "optional", label: "Project optional" },
          { value: "none", label: "No project tracking" },
        ],
        default: "optional",
        configKey: "projectRequired",
      },
    ],
  },
  {
    type: "requests",
    name: "Purchase Requests",
    description: "Purchase requisitions and procurement workflow",
    icon: "ShoppingCart",
    questions: [
      {
        id: "req-approval",
        question: "What's the approval threshold for purchase requests?",
        options: [
          { value: "none", label: "No approval needed" },
          { value: "manager", label: "Manager approval for all" },
          { value: "threshold", label: "Manager approval above threshold" },
        ],
        default: "manager",
        configKey: "approvalMode",
      },
      {
        id: "req-budget",
        question: "Do you need budget tracking for purchases?",
        options: [
          { value: "yes", label: "Track against project budgets" },
          { value: "no", label: "No budget tracking" },
        ],
        default: "no",
        configKey: "budgetTracking",
      },
    ],
  },
  {
    type: "accounting",
    name: "Accounting Integration",
    description: "Chart of accounts, categories, and export bundles",
    icon: "BookOpen",
    questions: [
      {
        id: "acc-mode",
        question: "How should expenses integrate with accounting?",
        options: [
          { value: "auto", label: "Auto-generate polizas on approval" },
          { value: "manual", label: "Manual export to accounting system" },
          { value: "api", label: "API integration with external system" },
        ],
        default: "manual",
        configKey: "exportMode",
      },
      {
        id: "acc-categories",
        question: "Do you have an existing chart of accounts?",
        options: [
          { value: "import", label: "I'll import my chart of accounts" },
          { value: "template", label: "Use a standard template" },
          { value: "manual", label: "I'll set it up manually" },
        ],
        default: "template",
        configKey: "chartSource",
      },
    ],
  },
  {
    type: "ai",
    name: "AI Assistance",
    description: "Smart categorization, document analysis, and copilot",
    icon: "Sparkles",
    questions: [
      {
        id: "ai-categorization",
        question: "Enable AI-powered expense categorization?",
        options: [
          { value: "yes", label: "Yes, suggest categories automatically" },
          { value: "no", label: "No, manual categorization only" },
        ],
        default: "yes",
        configKey: "autoCategorize",
      },
      {
        id: "ai-copilot",
        question: "Enable AI Copilot for employees?",
        options: [
          { value: "yes", label: "Yes, show copilot panel by default" },
          { value: "on-demand", label: "On-demand (user can open)" },
          { value: "no", label: "Disable copilot" },
        ],
        default: "on-demand",
        configKey: "copilotMode",
      },
    ],
  },
];

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  name: "",
  currency: "MXN",
  timezone: "America/Mexico_City",
  industry: "",
  country: "MX",
};

export const DEFAULT_MODULE_CONFIG: ModuleConfig = {
  enabled: false,
  approvalStages: [],
  settings: {},
};

export const STEP_ORDER: OnboardingStep[] = [
  "welcome",
  "company-profile",
  "select-modules",
  "configure-module",
  "review",
];