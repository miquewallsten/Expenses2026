import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/context/UserContext", () => ({
  useUserContext: () => ({ companyId: 1, role: "admin" }),
}));

const mockSession = { isSuperAdmin: true };
vi.mock("@/lib/session", () => ({
  getAuthHeaders: () => ({ Authorization: "Bearer test" }),
  getStoredSession: () => mockSession,
}));

const mockExecuteAction = vi.fn();
vi.mock("@/lib/mywork/actions", () => ({
  executeAction: (...args: unknown[]) => mockExecuteAction(...args),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/admin/AdminCompanySetupStudio", () => ({
  default: ({ companyId }: { companyId: number }) => (
    <div data-testid="company-setup-panel">CompanySetup {companyId}</div>
  ),
}));

vi.mock("@/components/admin/AdminUsersPanel", () => ({
  default: ({ users }: { users: unknown[] }) => (
    <div data-testid="users-panel">Users {users.length}</div>
  ),
}));

vi.mock("@/components/admin/AdminPoliciesPanel", () => ({
  default: ({ companyId }: { companyId: number }) => (
    <div data-testid="expense-policy-panel">ExpensePolicy {companyId}</div>
  ),
}));

vi.mock("@/components/admin/AdminAccountingSetupStudio", () => ({
  default: ({ companyId }: { companyId: number }) => (
    <div data-testid="accounting-setup-panel">AccountingSetup {companyId}</div>
  ),
}));

vi.mock("@/components/admin/AdminWorkflowMapPanel", () => ({
  default: ({ companyId }: { companyId: number }) => (
    <div data-testid="workflow-panel">Workflow {companyId}</div>
  ),
}));

// Stub global fetch for admin data
const mockFetch = vi.fn();
Object.defineProperty(globalThis, "fetch", { value: mockFetch, writable: true, configurable: true });

// ── Imports ──────────────────────────────────────────────────────────────────

import AdminNavigation from "@/components/admin/AdminNavigation";
import AnnouncementPanel from "@/components/admin/AnnouncementPanel";
import AdminModule from "@/components/modules/AdminModule";
import SuperAdminModule from "@/components/modules/SuperAdminModule";

beforeEach(() => {
  mockExecuteAction.mockReset();
  mockFetch.mockReset();
  mockSession.isSuperAdmin = true;
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("/admin/company-setup/")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ legal_entities: [] }) });
    }
    if (url.includes("/users?")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }
    if (url.includes("/expenses/policy/")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }
    if (url.includes("/admin/accounting-setup/")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }
    if (url.includes("/admin/workflow-setup/")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

// ── AdminNavigation ────────────────────────────────────────────────────────────

describe("AdminNavigation", () => {
  it("renders all 7 sections", () => {
    render(
      <AdminNavigation
        activeSection="company-setup"
        onSelect={() => {}}
      />
    );
    const nav = screen.getByTestId("admin-navigation");
    expect(nav).toBeInTheDocument();
    const labels = Array.from(nav.querySelectorAll("button span.truncate")).map((el) => el.textContent);
    expect(labels).toContain("Company Setup");
    expect(labels).toContain("Expense Policy");
    expect(labels).toContain("Approval Workflow");
    expect(labels).toContain("Users & Roles");
    expect(labels).toContain("Accounting Setup");
    expect(labels).toContain("Integrations");
    expect(labels).toContain("Advanced Settings");
  });

  it("highlights active section", () => {
    render(
      <AdminNavigation
        activeSection="users-roles"
        onSelect={() => {}}
      />
    );
    const nav = screen.getByTestId("admin-navigation");
    const activeBtn = Array.from(nav.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Users & Roles")
    );
    expect(activeBtn?.className).toContain("bg-indigo-600/[0.18]");
  });

  it("calls onSelect when clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AdminNavigation activeSection="company-setup" onSelect={onSelect} />);
    const nav = screen.getByTestId("admin-navigation");
    const btn = Array.from(nav.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Expense Policy")
    )!;
    await user.click(btn);
    expect(onSelect).toHaveBeenCalledWith("expense-policy");
  });
});

// ── AnnouncementPanel ────────────────────────────────────────────────────────

describe("AnnouncementPanel", () => {
  it("calls executeAction on send", async () => {
    mockExecuteAction.mockResolvedValue({ success: true });
    render(<AnnouncementPanel />);
    const textarea = screen.getByPlaceholderText("Type your announcement…");
    fireEvent.change(textarea, { target: { value: "Hello team" } });
    fireEvent.click(screen.getByTestId("announcement-send"));
    await waitFor(() => {
      expect(mockExecuteAction).toHaveBeenCalledWith(
        "announcement:send",
        "admin",
        expect.objectContaining({
          message: "Hello team",
          target: "all",
          channels: expect.arrayContaining(["mywork"]),
        })
      );
    });
  });

  it("shows error when message is empty", async () => {
    render(<AnnouncementPanel />);
    fireEvent.click(screen.getByTestId("announcement-send"));
    expect(mockExecuteAction).not.toHaveBeenCalled();
  });
});

// ── AdminModule ──────────────────────────────────────────────────────────────

describe("AdminModule", () => {
  it("renders correct section based on active state", async () => {
    render(<AdminModule />);
    await waitFor(() => {
      expect(screen.getByTestId("company-setup-panel")).toBeInTheDocument();
    });
  });

  it("switches to users panel when clicked", async () => {
    const user = userEvent.setup();
    render(<AdminModule />);
    await waitFor(() => {
      expect(screen.getByTestId("company-setup-panel")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Users & Roles"));
    await waitFor(() => {
      expect(screen.getByTestId("users-panel")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    // Override fetch to never resolve so loading persists
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<AdminModule />);
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.getByTestId("admin-module")).toBeInTheDocument();
  });
});

// ── SuperAdminModule ─────────────────────────────────────────────────────────

describe("SuperAdminModule", () => {
  it("renders tiles", () => {
    render(<SuperAdminModule />);
    expect(screen.getByText("Agent Builder")).toBeInTheDocument();
    expect(screen.getByText("LLM Configuration")).toBeInTheDocument();
    expect(screen.getByText("Usage Analytics")).toBeInTheDocument();
    expect(screen.getByText("System Health")).toBeInTheDocument();
    expect(screen.getByText("Tenant Management")).toBeInTheDocument();
  });

  it("shows access required for non-super-admins", () => {
    mockSession.isSuperAdmin = false;
    render(<SuperAdminModule />);
    expect(screen.getByText("Super admin access required.")).toBeInTheDocument();
  });
});
