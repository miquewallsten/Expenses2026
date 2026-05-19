/**
 * Onboarding Wizard Types
 * Phase 5: Admin Onboarding Wizard for Enterprise App
 * Redesigned: AI-guided onboarding with intelligent defaults
 */

export type OnboardingStep =
  | "welcome"
  | "company-type"
  | "company-basics"
  | "recommendations"
  | "smart-config"
  | "ready";

export type ModuleType =
  | "expenses"
  | "timesheets"
  | "requests"
  | "accounting"
  | "ai";

export type CompanyType =
  | "tech-startup"
  | "professional-services"
  | "manufacturing"
  | "retail"
  | "other";

export interface CompanyProfile {
  name: string;
  currency: string;
  timezone: string;
  industry?: string;
  country?: string;
  companyType?: CompanyType;
}

export interface ModuleRecommendation {
  module: ModuleType;
  reason: string;
  keyFeatures: string[];
}

export interface AIContext {
  greeting: string;
  insight: string;
  suggestion: string;
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
  "company-type",
  "company-basics",
  "recommendations",
  "smart-config",
  "ready",
];

export const COMPANY_TYPES: { type: CompanyType; name: string; description: string; icon: string }[] = [
  {
    type: "tech-startup",
    name: "Tech Startup",
    description: "Software, hardware, or technology services company",
    icon: "Rocket",
  },
  {
    type: "professional-services",
    name: "Professional Services",
    description: "Consulting, legal, accounting, or other professional services",
    icon: "Briefcase",
  },
  {
    type: "manufacturing",
    name: "Manufacturing",
    description: "Production, assembly, or industrial operations",
    icon: "Factory",
  },
  {
    type: "retail",
    name: "Retail",
    description: "Retail stores, e-commerce, or consumer goods",
    icon: "Store",
  },
  {
    type: "other",
    name: "Other",
    description: "Something else — I'll describe my company",
    icon: "Building2",
  },
];

/**
 * AI-generated module recommendations based on company type.
 * These are intelligent defaults that can be customized.
 */
export function getRecommendationsForCompanyType(
  companyType: CompanyType,
  industry?: string
): ModuleRecommendation[] {
  const recommendations: Record<CompanyType, ModuleRecommendation[]> = {
    "tech-startup": [
      {
        module: "expenses",
        reason: "Startups move fast — employees need easy expense submission via web or WhatsApp",
        keyFeatures: ["WhatsApp submission", "AI categorization", "Quick approval"],
      },
      {
        module: "accounting",
        reason: "Clean books from day one — export to your accounting system automatically",
        keyFeatures: ["Auto Poliza export", "CFDI integration", "Chart of accounts"],
      },
      {
        module: "ai",
        reason: "Save time on manual work — let AI categorize expenses and match receipts",
        keyFeatures: ["Smart categorization", "Receipt OCR", "Anomaly detection"],
      },
    ],
    "professional-services": [
      {
        module: "expenses",
        reason: "Client-facing expenses need clear approval trails and project tracking",
        keyFeatures: ["Project tagging", "Multi-client allocation", "Receipt matching"],
      },
      {
        module: "timesheets",
        reason: "Billable hours are your revenue — track time by project and client",
        keyFeatures: ["Project tracking", "Billable hours", "Approval workflow"],
      },
      {
        module: "accounting",
        reason: "Export clean, auditable records for client billing and tax compliance",
        keyFeatures: ["CFDI integration", "Category mapping", "Poliza bundles"],
      },
    ],
    manufacturing: [
      {
        module: "expenses",
        reason: "Track production expenses and operational costs with policy enforcement",
        keyFeatures: ["Policy validation", "Cost center tagging", "Multi-approval"],
      },
      {
        module: "timesheets",
        reason: "Manage shift workers and project-based time tracking",
        keyFeatures: ["Shift tracking", "Overtime rules", "Project allocation"],
      },
      {
        module: "accounting",
        reason: "Integrate with SAP, Oracle, or other ERP systems",
        keyFeatures: ["ERP integration", "Multi-entity support", "Tax compliance"],
      },
    ],
    retail: [
      {
        module: "expenses",
        reason: "Store managers and staff need simple expense submission with policy guardrails",
        keyFeatures: ["Simple mobile submission", "Policy checks", "Quick approval"],
      },
      {
        module: "accounting",
        reason: "Sync with retail accounting systems and manage inventory-related expenses",
        keyFeatures: ["Multi-store support", "Category mapping", "Tax compliance"],
      },
    ],
    other: [
      {
        module: "expenses",
        reason: "Every company needs expense tracking — start here and customize as you grow",
        keyFeatures: ["Flexible approval", "Receipt capture", "Basic reporting"],
      },
      {
        module: "accounting",
        reason: "Keep your books organized from day one",
        keyFeatures: ["Chart of accounts", "Category mapping", "Export bundles"],
      },
    ],
  };

  return recommendations[companyType] ?? recommendations.other;
}

/**
 * AI context messages for each step.
 * These provide helpful, contextual guidance throughout onboarding.
 */
export function getAIContextForStep(
  step: OnboardingStep,
  companyType?: CompanyType,
  companyProfile?: Partial<CompanyProfile>
): AIContext {
  const contexts: Record<OnboardingStep, AIContext> = {
    welcome: {
      greeting: "Hi! I'm your setup guide.",
      insight: "I'll help you configure everything perfectly for your company type.",
      suggestion: "Let's start by understanding what kind of company you have.",
    },
    "company-type": {
      greeting: "Great choice!",
      insight: companyType === "tech-startup"
        ? "Startups often need flexible expense tracking and quick approvals."
        : companyType === "professional-services"
          ? "Service firms need strong project tracking and billable hour management."
          : "I'll configure the right modules for your business type.",
      suggestion: "I'll recommend the best modules once you select your company type.",
    },
    "company-basics": {
      greeting: "Perfect!",
      insight: companyProfile?.country === "MX"
        ? "I'm setting up CFDI integration for Mexican tax compliance."
        : "I'm configuring your currency and timezone settings.",
      suggestion: companyProfile?.name
        ? `${companyProfile.name} is ready to go. Let's configure your modules.`
        : "Enter your company name and I'll set up the basics automatically.",
    },
    recommendations: {
      greeting: "I've analyzed your setup.",
      insight: "Based on your company type, these modules will give you the most value.",
      suggestion: "You can customize this selection, or trust my recommendations.",
    },
    "smart-config": {
      greeting: "Almost done!",
      insight: "I've configured everything based on your selections.",
      suggestion: "Review the settings below, or ask me to change anything.",
    },
    ready: {
      greeting: "You're all set!",
      insight: "Your platform is configured and ready to use.",
      suggestion: "I'll be available in the admin panel whenever you need help.",
    },
  };

  return contexts[step];
}