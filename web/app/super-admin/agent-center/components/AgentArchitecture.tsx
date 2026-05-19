"use client";

import { useState } from "react";
import {
  Bot,
  Settings,
  Calculator,
  Users,
  ArrowRight,
  FileText,
  Shield,
  Cpu,
  KeyRound,
  Workflow,
  Upload,
  Brain,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Wrench,
  Lock,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────────────────────── */

type FlowStep = {
  id: string;
  label: string;
  sublabel?: string;
  icon: typeof Bot;
  color: string;
  detail?: string;
};

/* ── Architecture Diagram ──────────────────────────────────────────────── */

export default function AgentArchitecture() {
  const [expandedNode, setExpandedNode] = useState<string | null>(null);

  const personas: {
    key: string;
    label: string;
    tools: number;
    icon: typeof Bot;
    color: string;
    desc: string;
    canDo: string[];
    cantDo: string[];
  }[] = [
    {
      key: "admin",
      label: "Admin Copilot",
      tools: 166,
      icon: Settings,
      color: "text-accent border-accent/30 bg-accent-muted",
      desc: "Full system access - configure, diagnose, maintain.",
      canDo: [
        "Create/invite/update/deactivate users",
        "Company setup & legal entities",
        "Expense policies & approval workflows",
        "Channels (WhatsApp, Email)",
        "Auth settings & RBAC",
        "Archive & storage config",
        "All accounting tools (read + write)",
      ],
      cantDo: [],
    },
    {
      key: "accounting",
      label: "Accounting Copilot",
      tools: 108,
      icon: Calculator,
      color: "text-amber-400 border-amber-500/30 bg-amber-500/10",
      desc: "Full accounting domain - reports, categories, polizas, vendors, rules.",
      canDo: [
        "Accounting setup & categories",
        "Chart of accounts & tax rates",
        "Expense reports & poliza preview",
        "Vendors, dimensions, rules",
        "Month close & fiscal calendar",
        "File analysis (any type)",
        "Memory & preferences across sessions",
      ],
      cantDo: [
        "Create or modify users",
        "Change expense policies",
        "Change approval workflows",
        "Configure channels or auth",
        "Modify RBAC or roles",
      ],
    },
    {
      key: "employee",
      label: "Employee Agent",
      tools: 20,
      icon: Users,
      color: "text-success border-success/30 bg-success-muted",
      desc: "Expense intake, time tracking, receipts - WhatsApp channel.",
      canDo: [
        "Create expenses & submit receipts",
        "Check reimbursement status",
        "Submit time entries",
        "WhatsApp expense photo submission",
      ],
      cantDo: [
        "Approve expenses",
        "Access accounting config",
        "Administer users or policies",
      ],
    },
    {
      key: "super_admin",
      label: "Super Admin",
      tools: 173,
      icon: Shield,
      color: "text-error border-error/30 bg-error-muted",
      desc: "Platform owner - manages tenants, LLM providers, agent definitions.",
      canDo: [
        "All admin tools + super admin tools",
        "Tenant CRUD & provisioning",
        "LLM provider configuration",
        "Agent definition management",
      ],
      cantDo: [],
    },
  ];

  const uploadFlow: FlowStep[] = [
    { id: "upload", label: "User uploads file", sublabel: "Any type: Excel, PDF, XML, image, ZIP...", icon: Upload, color: "text-blue-400" },
    { id: "analyze", label: "Agent analyzes", sublabel: "analyze_file auto-detects content type", icon: Eye, color: "text-amber-400" },
    { id: "decide", label: "Agent decides action", sublabel: "Ask user: import or reference?", icon: Brain, color: "text-purple-400" },
    { id: "ingest", label: "Ingest & confirm", sublabel: "Creates receipt → user confirms", icon: CheckCircle2, color: "text-green-400" },
    { id: "apply", label: "Apply changes", sublabel: "Catalog, vendors, users, org entities", icon: Wrench, color: "text-accent" },
  ];

  const expenseFlow: FlowStep[] = [
    { id: "create", label: "Employee creates expense", sublabel: "Form, file upload, or WhatsApp photo", icon: FileText, color: "text-green-400" },
    { id: "validate", label: "Validate against policies", sublabel: "CFDI check, amount limits, receipt required", icon: AlertTriangle, color: "text-amber-400" },
    { id: "approve", label: "Manager approves", sublabel: "Approval chain based on amount & type", icon: Users, color: "text-blue-400" },
    { id: "bundle", label: "Build expense report", sublabel: "Bundle verified expenses by period", icon: Workflow, color: "text-purple-400" },
    { id: "review", label: "Accounting review", sublabel: "Categorize, map accounts, separate tax", icon: Calculator, color: "text-amber-400" },
    { id: "poliza", label: "Generate póliza", sublabel: "Accounting output with tax separation", icon: FileText, color: "text-accent" },
  ];

  return (
    <div className="space-y-8">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-bold text-primary">Agent Architecture</h2>
        <p className="text-xs text-secondary mt-1">
          How agents work together - personas, permissions, and data flow.
        </p>
      </div>

      {/* ── Persona Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        {personas.map((p) => {
          const Icon = p.icon;
          const expanded = expandedNode === p.key;
          return (
            <button
              key={p.key}
              onClick={() => setExpandedNode(expanded ? null : p.key)}
              className={`rounded-lg border p-4 text-left transition-all hover:border-accent/50 ${p.color} ${expanded ? "col-span-2" : ""}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <div>
                    <div className="text-sm font-bold">{p.label}</div>
                    <div className="text-[10px] text-secondary">{p.tools} tools</div>
                  </div>
                </div>
                <div className="rounded-full bg-surface-2 px-2 py-0.5 text-[9px] font-mono text-secondary">
                  {p.key}
                </div>
              </div>
              <p className="text-[11px] text-secondary mt-2">{p.desc}</p>
              {expanded && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-green-400 mb-1">Can Do</div>
                    <ul className="space-y-0.5">
                      {p.canDo.map((item) => (
                        <li key={item} className="text-[11px] text-secondary flex items-start gap-1.5">
                          <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0 mt-0.5" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {p.cantDo.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1">Cannot Do</div>
                      <ul className="space-y-0.5">
                        {p.cantDo.map((item) => (
                          <li key={item} className="text-[11px] text-secondary flex items-start gap-1.5">
                            <Lock className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── LLM Resolution ──────────────────────────────────────────────── */}
      <div className="rounded-lg border border-subtle bg-surface-1 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Cpu className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-bold text-primary">LLM Provider Resolution</h3>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="rounded border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-center">
            <div className="text-[10px] font-bold text-blue-400">1. DB Global</div>
            <div className="text-[9px] text-secondary">Super Admin default</div>
          </div>
          <ArrowRight className="h-3 w-3 text-muted" />
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center">
            <div className="text-[10px] font-bold text-amber-400">2. Company Override</div>
            <div className="text-[9px] text-secondary">Per-tenant if viable</div>
          </div>
          <ArrowRight className="h-3 w-3 text-muted" />
          <div className="rounded border border-green-500/30 bg-green-500/10 px-3 py-2 text-center">
            <div className="text-[10px] font-bold text-green-400">3. Env Fallback</div>
            <div className="text-[9px] text-secondary">OLLAMA_API_KEY</div>
          </div>
        </div>
        <p className="text-[10px] text-tertiary mt-2">
          Every agent call resolves the LLM provider first. The Super Admin sets the global config at <span className="font-mono text-accent">/super-admin/llm-config</span>. Companies can override per-tenant.
        </p>
      </div>

      {/* ── File Upload Flow ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-subtle bg-surface-1 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Upload className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-bold text-primary">File Upload & Analysis Flow</h3>
        </div>
        <div className="flex items-stretch gap-1">
          {uploadFlow.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.id} className="flex-1 flex flex-col items-center">
                <div className="flex items-center gap-1 w-full">
                  {i > 0 && <div className="flex-1 h-px bg-subtle" />}
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-surface-0 ${step.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  {i < uploadFlow.length - 1 && <div className="flex-1 h-px bg-subtle" />}
                </div>
                <div className="mt-1 text-center">
                  <div className="text-[10px] font-bold text-primary">{step.label}</div>
                  <div className="text-[9px] text-secondary max-w-32">{step.sublabel}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
          <div className="rounded border border-subtle px-2 py-1.5">
            <span className="font-bold text-accent">Supported types:</span>{" "}
            Images (JPEG, PNG, GIF, WebP, BMP, TIFF), PDF, Excel (XLSX, XLS, ODS, CSV, TSV),
            XML/CFDI, Word (DOCX, DOC), ZIP, Text
          </div>
          <div className="rounded border border-subtle px-2 py-1.5">
            <span className="font-bold text-accent">Auto-detection:</span>{" "}
            Chart of accounts → <span className="font-mono text-accent">ingest_accounting_catalog</span>,
            Vendor list → <span className="font-mono text-accent">create_vendor</span>,
            User roster → <span className="font-mono text-accent">ingest_user_roster</span>,
            CFDI → fiscal data extraction
          </div>
        </div>
      </div>

      {/* ── Expense Lifecycle ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-subtle bg-surface-1 p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-bold text-primary">Expense Lifecycle Flow</h3>
        </div>
        <div className="flex items-stretch gap-1">
          {expenseFlow.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.id} className="flex-1 flex flex-col items-center">
                <div className="flex items-center gap-1 w-full">
                  {i > 0 && <div className="flex-1 h-px bg-subtle" />}
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-surface-0 ${step.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  {i < expenseFlow.length - 1 && <div className="flex-1 h-px bg-subtle" />}
                </div>
                <div className="mt-1 text-center">
                  <div className="text-[10px] font-bold text-primary">{step.label}</div>
                  <div className="text-[9px] text-secondary max-w-36">{step.sublabel}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Copilot Routing ──────────────────────────────────────────────── */}
      <div className="rounded-lg border border-subtle bg-surface-1 p-4">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-bold text-primary">Copilot Routing</h3>
        </div>
        <div className="flex items-center justify-center gap-4 text-[11px]">
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-center">
            <div className="text-xs font-bold text-blue-400">Admin Pages</div>
            <div className="text-[10px] text-secondary mt-1">
              → <span className="font-mono text-blue-300">persona=&quot;admin&quot;</span>
            </div>
            <div className="text-[10px] text-secondary">166 tools · Full access</div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted" />
          <div className="rounded-lg border border-accent/30 bg-accent-muted px-4 py-3 text-center">
            <div className="text-xs font-bold text-accent">CopilotLauncher</div>
            <div className="text-[10px] text-secondary mt-1">Cmd/Ctrl+K</div>
            <div className="text-[10px] text-secondary">Detects role + page</div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted" />
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center">
            <div className="text-xs font-bold text-amber-400">Accounting Pages</div>
            <div className="text-[10px] text-secondary mt-1">
              → <span className="font-mono text-amber-300">persona=&quot;accounting&quot;</span>
            </div>
            <div className="text-[10px] text-secondary">108 tools · Domain access</div>
          </div>
        </div>
        <p className="text-[10px] text-tertiary mt-3 text-center">
          The CopilotLauncher detects the user&apos;s role and current page to route to the correct persona. Admin sees admin copilot on admin pages; accounting sees accounting copilot on accounting pages. Both share the same AgentChat component with streaming SSE.
        </p>
      </div>

      {/* ── Agentic Behaviors ────────────────────────────────────────────── */}
      <div className="rounded-lg border border-subtle bg-surface-1 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-bold text-primary">Agentic Behaviors</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <div className="space-y-2">
            <div className="font-bold text-primary">Session Start</div>
            <ul className="space-y-1 text-secondary">
              <li>• Auto-recall preferences & memories</li>
              <li>• Check for open insights & fiscal deadlines</li>
              <li>• Suggest next steps proactively</li>
            </ul>
            <div className="font-bold text-primary mt-2">Memory</div>
            <ul className="space-y-1 text-secondary">
              <li>• <span className="font-mono text-accent">remember</span> / <span className="font-mono text-accent">recall</span> - persistent facts</li>
              <li>• <span className="font-mono text-accent">save_accounting_preference</span> - format/rules</li>
              <li>• Cross-session memory for both copilots</li>
            </ul>
          </div>
          <div className="space-y-2">
            <div className="font-bold text-primary">Autonomy</div>
            <ul className="space-y-1 text-secondary">
              <li>• Max 20 iterations per turn</li>
              <li>• Max 80 session turns</li>
              <li>• Destructive actions require receipt confirmation</li>
              <li>• Receipts expire after 60 minutes</li>
            </ul>
            <div className="font-bold text-primary mt-2">Delegation</div>
            <ul className="space-y-1 text-secondary">
              <li>• Accounting can&apos;t modify admin → tells user to ask admin</li>
              <li>• Admin can do everything including accounting</li>
              <li>• Employee copilot only handles expense & time</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── DB-Seeded Agent Definitions ────────────────────────────────────── */}
      <div className="rounded-lg border border-subtle bg-surface-1 p-4">
        <div className="flex items-center gap-2 mb-3">
          <KeyRound className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-bold text-primary">DB-Seeded Agent Definitions</h3>
        </div>
        <p className="text-[10px] text-secondary mb-3">
          These are default definitions in the <span className="font-mono text-accent">agent_definitions</span> table, seeded on startup. Used for specialized routing (WhatsApp channels, orchestrator). The CopilotLauncher uses <em>runtime personas</em> with all tools for that persona - not these definitions.
        </p>
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          {[
            { key: "orchestrator", name: "Orchestrator", persona: "admin", desc: "Routes requests to specialist" },
            { key: "config", name: "Configuration", persona: "admin", desc: "Admin setup, policies, users" },
            { key: "expense", name: "Expense", persona: "employee", desc: "Expense intake, WhatsApp" },
            { key: "accounting", name: "Accounting", persona: "accounting", desc: "Categories, polizas, reports" },
            { key: "compliance", name: "Compliance", persona: "admin", desc: "AI policies, governance" },
            { key: "channels", name: "Channel", persona: "employee", desc: "WhatsApp/Email handling" },
          ].map((def) => (
            <div key={def.key} className="rounded border border-subtle px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-primary">{def.key}</span>
                <span className={`rounded px-1 py-0.5 text-[8px] font-bold ${
                  def.persona === "admin" ? "bg-accent-muted text-accent" :
                  def.persona === "accounting" ? "bg-amber-500/10 text-amber-400" :
                  "bg-success-muted text-success"
                }`}>
                  {def.persona}
                </span>
              </div>
              <div className="text-[9px] text-secondary">{def.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
