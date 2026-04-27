import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NewExpenseModal from "@/components/employee/NewExpenseModal";

vi.mock("@/lib/session", () => ({
  getAuthHeaders: () => ({ "X-User-Id": "1" }),
  getStoredSession: () => ({
    token: "t",
    userId: 1,
    email: "e@x.com",
    role: "employee",
    companyId: 1,
    fullName: "Test",
  }),
}));

vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:8000");

const onClose = vi.fn();
const onCreated = vi.fn();

function renderModal(open = true) {
  return render(
    <NewExpenseModal open={open} onClose={onClose} onCreated={onCreated} />
  );
}

// Helper: get the description input (first text input in the form)
function getDescInput() {
  const dialog = screen.getByRole("dialog");
  const inputs = dialog.querySelectorAll("input[type='text'], input:not([type])");
  return inputs[0] as HTMLInputElement;
}

// Helper: get the amount input (number input)
function getAmountInput() {
  const dialog = screen.getByRole("dialog");
  return dialog.querySelector("input[type='number']") as HTMLInputElement;
}

// Helper: get the submit button
function getSubmitButton() {
  return screen.getByRole("button", { name: /save|guardar|crear|create/i }) ??
    screen.getAllByRole("button").find(b => b.getAttribute("type") === "submit");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

describe("NewExpenseModal", () => {
  it("does not render when closed", () => {
    renderModal(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the form when open", () => {
    renderModal();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows a validation error when description is empty on submit", async () => {
    renderModal();
    const form = screen.getByRole("dialog").querySelector("form")!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText("errorRequired")).toBeInTheDocument();
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows a validation error when amount is invalid", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(getDescInput(), "Team lunch");
    await user.type(getAmountInput(), "-5");
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await waitFor(() => {
      expect(screen.getByText("errorAmount")).toBeInTheDocument();
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls POST /expenses/ and closes on successful submit", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { status: 201 }));
    renderModal();
    await user.type(getDescInput(), "Team lunch");
    await user.type(getAmountInput(), "150");
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/expenses/"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows server error message when API returns non-OK", async () => {
    const user = userEvent.setup();
    // Route fetch by URL: duplicate-check returns empty (no banner), submit
    // returns 401. This is robust to ordering vs. the debounced dup-check
    // call introduced in Phase 5.3.
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/expenses/duplicates/check")) {
        return new Response(JSON.stringify({ matches: [], blocking: false }), { status: 200 });
      }
      return new Response(JSON.stringify({ detail: "Unauthorized" }), { status: 401 });
    });
    renderModal();
    await user.type(getDescInput(), "Test expense");
    await user.type(getAmountInput(), "50");
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await waitFor(() => {
      expect(screen.getByText("Unauthorized")).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when Escape is pressed", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("clears the form when reopened", () => {
    const { rerender } = renderModal();
    const input = getDescInput();
    fireEvent.change(input, { target: { value: "some text" } });
    rerender(<NewExpenseModal open={false} onClose={onClose} onCreated={onCreated} />);
    rerender(<NewExpenseModal open={true} onClose={onClose} onCreated={onCreated} />);
    expect(getDescInput().value).toBe("");
  });
});
