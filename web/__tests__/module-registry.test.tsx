import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React, { Suspense } from "react";

// ── Mocks ────────────────────────────────────────────────────────────────────

let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/mywork",
  useSearchParams: () => currentSearchParams,
  useParams: () => ({}),
}));

// Stub lazy-loaded modules so tests don't fail on missing files
vi.mock("@/components/modules/ExpensesModule", () => ({
  default: () => <div data-testid="expenses-module">Expenses Module</div>,
}));

vi.mock("@/components/modules/ApprovalsModule", () => ({
  default: () => <div data-testid="approvals-module">Approvals Module</div>,
}));

vi.mock("@/components/modules/AccountingModule", () => ({
  default: () => <div data-testid="accounting-module">Accounting Module</div>,
}));

vi.mock("@/components/modules/AdminModule", () => ({
  default: () => <div data-testid="admin-module">Admin Module</div>,
}));

vi.mock("@/components/modules/SuperAdminModule", () => ({
  default: () => <div data-testid="super-admin-module">Super Admin Module</div>,
}));

vi.mock("@/components/modules/TimeModule", () => ({
  default: () => <div data-testid="time-module">Time Module</div>,
}));

vi.mock("@/components/modules/ReportsModule", () => ({
  default: () => <div data-testid="reports-module">Reports Module</div>,
}));

const ModuleRegistry = React.lazy(() => import("@/components/mywork/ModuleRegistry"));

beforeEach(() => {
  currentSearchParams = new URLSearchParams();
});

describe("ModuleRegistry", () => {
  it("shows prompt when no module is selected", async () => {
    render(
      <Suspense fallback={<div>loading</div>}>
        <ModuleRegistry />
      </Suspense>
    );
    await waitFor(() => {
      expect(screen.getByText(/select a module from the sidebar/i)).toBeInTheDocument();
    });
  });

  it("lazy loads the expenses module", async () => {
    currentSearchParams = new URLSearchParams("module=expenses");
    render(
      <Suspense fallback={<div>loading</div>}>
        <ModuleRegistry />
      </Suspense>
    );
    await waitFor(() => {
      expect(screen.getByTestId("expenses-module")).toBeInTheDocument();
    });
  });

  it("lazy loads the approvals module", async () => {
    currentSearchParams = new URLSearchParams("module=approvals");
    render(
      <Suspense fallback={<div>loading</div>}>
        <ModuleRegistry />
      </Suspense>
    );
    await waitFor(() => {
      expect(screen.getByTestId("approvals-module")).toBeInTheDocument();
    });
  });

  it("lazy loads the accounting module", async () => {
    currentSearchParams = new URLSearchParams("module=accounting");
    render(
      <Suspense fallback={<div>loading</div>}>
        <ModuleRegistry />
      </Suspense>
    );
    await waitFor(() => {
      expect(screen.getByTestId("accounting-module")).toBeInTheDocument();
    });
  });

  it("lazy loads the admin module", async () => {
    currentSearchParams = new URLSearchParams("module=admin");
    render(
      <Suspense fallback={<div>loading</div>}>
        <ModuleRegistry />
      </Suspense>
    );
    await waitFor(() => {
      expect(screen.getByTestId("admin-module")).toBeInTheDocument();
    });
  });

  it("lazy loads the super-admin module", async () => {
    currentSearchParams = new URLSearchParams("module=super-admin");
    render(
      <Suspense fallback={<div>loading</div>}>
        <ModuleRegistry />
      </Suspense>
    );
    await waitFor(() => {
      expect(screen.getByTestId("super-admin-module")).toBeInTheDocument();
    });
  });

  it("lazy loads the time module", async () => {
    currentSearchParams = new URLSearchParams("module=time");
    render(
      <Suspense fallback={<div>loading</div>}>
        <ModuleRegistry />
      </Suspense>
    );
    await waitFor(() => {
      expect(screen.getByTestId("time-module")).toBeInTheDocument();
    });
  });

  it("lazy loads the reports module", async () => {
    currentSearchParams = new URLSearchParams("module=reports");
    render(
      <Suspense fallback={<div>loading</div>}>
        <ModuleRegistry />
      </Suspense>
    );
    await waitFor(() => {
      expect(screen.getByTestId("reports-module")).toBeInTheDocument();
    });
  });

  it("shows module not found for unknown modules", async () => {
    currentSearchParams = new URLSearchParams("module=unknown");
    render(
      <Suspense fallback={<div>loading</div>}>
        <ModuleRegistry />
      </Suspense>
    );
    await waitFor(() => {
      expect(screen.getByText(/module not found/i)).toBeInTheDocument();
    });
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });
});
