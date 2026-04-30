import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockFetchManifest = vi.fn();
const mockApiCall = vi.fn();

vi.mock("@/lib/mywork/manifest", () => ({
  fetchManifest: (...args: unknown[]) => mockFetchManifest(...args),
}));

vi.mock("@/lib/api/client", () => ({
  apiCall: (...args: unknown[]) => mockApiCall(...args),
}));

vi.mock("@/components/modules/ExpensesModule", () => ({
  default: () => <div data-testid="expenses-module">Expenses Module</div>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/mywork",
  useSearchParams: () => new URLSearchParams("module=expenses"),
  useParams: () => ({}),
}));

// Stub matchMedia for responsive tests
const mockMatchMedia = vi.fn();

// ── Imports ────────────────────────────────────────────────────────────────────

import { useManifest } from "@/hooks/useManifest";
import MyWorkShell from "@/components/mywork/MyWorkShell";
import MyWorkSidebar from "@/components/mywork/MyWorkSidebar";
import CopilotRail from "@/components/mywork/CopilotRail";

function ManifestHookConsumer() {
  const { manifest, loading, error, refresh } = useManifest();
  return (
    <div>
      <span data-testid="manifest-loading">{loading ? "loading" : "done"}</span>
      <span data-testid="manifest-error">{error ? error.message : "none"}</span>
      <span data-testid="manifest-user">{manifest?.user?.fullName || "no-user"}</span>
      <button data-testid="manifest-refresh" onClick={refresh}>Refresh</button>
    </div>
  );
}

const MANIFEST = {
  user: { id: 1, email: "a@b.com", fullName: "Test User", role: "employee", isSuperAdmin: false },
  permissions: ["expenses:create"],
  modules: [
    { id: "expenses", label: "Expenses" },
    { id: "approvals", label: "Approvals" },
  ],
  copilot: { agentId: "employee-copilot", allowedTools: ["expenses:create"] },
  tenant: { companyId: 1, companyName: "Acme Corp" },
};

beforeEach(() => {
  localStorage.clear();
  mockFetchManifest.mockReset();
  mockApiCall.mockReset();
  mockMatchMedia.mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  Object.defineProperty(window, "matchMedia", { value: mockMatchMedia, writable: true, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MyWorkShell", () => {
  it("shows loading spinner while manifest loads", async () => {
    mockFetchManifest.mockReturnValue(new Promise(() => {}));
    render(<MyWorkShell />);
    await waitFor(() => {
      expect(document.querySelector("[data-testid='mywork-shell']")).not.toBeInTheDocument();
    });
    // While loading we should see a spinner (no text, just a div with animate-spin)
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows error state when manifest fails", async () => {
    mockFetchManifest.mockRejectedValue(new Error("Network error"));
    render(<MyWorkShell />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load platform/i)).toBeInTheDocument();
    });
  });

  it("renders sidebar + main + copilot when manifest loads", async () => {
    mockFetchManifest.mockResolvedValue(MANIFEST);
    render(<MyWorkShell />);
    await waitFor(() => {
      expect(screen.getByTestId("mywork-shell")).toBeInTheDocument();
    });
    expect(screen.getByTestId("mywork-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("copilot-rail")).toBeInTheDocument();
  });
});

describe("MyWorkSidebar", () => {
  it("shows user name, company name, and role from manifest", async () => {
    render(<MyWorkSidebar manifest={MANIFEST} collapsed={false} onToggleCollapse={() => {}} />);
    await screen.findByText("Test User");
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("employee")).toBeInTheDocument();
  });

  it("lists enabled modules from manifest", async () => {
    render(<MyWorkSidebar manifest={MANIFEST} collapsed={false} onToggleCollapse={() => {}} />);
    await screen.findByText("Expenses");
    expect(screen.getByText("Approvals")).toBeInTheDocument();
  });

  it("highlights active module", async () => {
    render(<MyWorkSidebar manifest={MANIFEST} collapsed={false} onToggleCollapse={() => {}} />);
    const expensesBtn = await screen.findByText("Expenses");
    expect(expensesBtn.closest("button")?.getAttribute("aria-current")).toBe("page");
  });

  it("toggles collapse state", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <MyWorkSidebar manifest={MANIFEST} collapsed={false} onToggleCollapse={onToggle} />
    );
    const toggleBtn = await screen.findByLabelText(/collapse sidebar/i);
    await user.click(toggleBtn);
    expect(onToggle).toHaveBeenCalled();
  });
});

describe("CopilotRail", () => {
  it("renders expanded by default", async () => {
    mockApiCall.mockResolvedValue({ module: "expenses", copilot_suggestions: [] });
    render(<CopilotRail manifest={MANIFEST} />);
    await waitFor(() => {
      expect(screen.getByTestId("copilot-rail")).toBeInTheDocument();
    });
  });

  it("toggles to collapsed floating button", async () => {
    mockApiCall.mockResolvedValue({ module: "expenses", copilot_suggestions: [] });
    const user = userEvent.setup();
    render(<CopilotRail manifest={MANIFEST} />);
    await waitFor(() => {
      expect(screen.getByTestId("copilot-rail")).toBeInTheDocument();
    });
    const collapseBtn = screen.getByLabelText(/collapse copilot/i);
    await user.click(collapseBtn);
    await waitFor(() => {
      expect(screen.getByTestId("copilot-rail-collapsed")).toBeInTheDocument();
    });
  });
});

describe("useManifest", () => {
  it("fetches manifest on mount", async () => {
    mockFetchManifest.mockResolvedValue(MANIFEST);
    render(<ManifestHookConsumer />);
    await waitFor(() => {
      expect(screen.getByTestId("manifest-loading").textContent).toBe("done");
    });
    expect(screen.getByTestId("manifest-user").textContent).toBe("Test User");
    expect(mockFetchManifest).toHaveBeenCalledTimes(1);
  });

  it("caches manifest in localStorage", async () => {
    mockFetchManifest.mockResolvedValue(MANIFEST);
    render(<ManifestHookConsumer />);
    await waitFor(() => expect(screen.getByTestId("manifest-user").textContent).toBe("Test User"));
    const cached = localStorage.getItem("mywork_manifest_cache");
    expect(cached).toBeTruthy();
    const parsed = JSON.parse(cached!);
    expect(parsed.manifest.user.fullName).toBe("Test User");
  });

  it("refresh triggers a new fetch", async () => {
    mockFetchManifest.mockResolvedValue(MANIFEST);
    render(<ManifestHookConsumer />);
    await waitFor(() => expect(screen.getByTestId("manifest-user").textContent).toBe("Test User"));
    const user = userEvent.setup();
    await user.click(screen.getByTestId("manifest-refresh"));
    await waitFor(() => {
      expect(mockFetchManifest).toHaveBeenCalledTimes(2);
    });
  });
});
