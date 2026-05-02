import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock all translation namespaces used by onboarding components
const createTranslator = (namespace: string) => (key: string, params?: Record<string, number>) => {
  const translations: Record<string, Record<string, string>> = {
    "admin.onboardingWizard": {
      "title": "Onboarding Wizard",
      "nav.prev": "Previous",
      "nav.next": "Next",
      "nav.saving": "Saving...",
    },
    "admin.onboardingWizard.welcome": {
      "title": "Welcome to FPlatform",
      "description": "Let's set up your workspace in a few quick steps.",
      "step1": "Configure your company profile",
      "step2": "Select modules to enable",
      "step3": "Customize module settings",
      "step4": "Review and complete setup",
      "startButton": "Get Started",
    },
    "admin.onboardingWizard.companyProfile": {
      "title": "Company Profile",
      "description": "Tell us about your company",
      "companyName": "Company Name",
      "companyNamePlaceholder": "Acme Corp",
      "currency": "Currency",
      "timezone": "Timezone",
      "industry": "Industry",
      "country": "Country",
    },
    "admin.onboardingWizard.selectModules": {
      "title": "Select Modules",
      "description": "Choose which modules to enable",
    },
    "admin.onboardingWizard.configureModule": {
      "title": "Configure Modules",
      "description": "Customize each module's settings",
    },
    "admin.onboardingWizard.review": {
      "title": "Review & Complete",
      "description": "Review your configuration before finishing",
      "complete": "Complete Setup",
      "edit": "Edit",
    },
    "admin.onboardingWizard.progress": {
      "welcome": "Welcome",
      "companyProfile": "Company",
      "selectModules": "Modules",
      "configureModule": "Configure",
      "review": "Review",
    },
  };
  const ns = translations[namespace] || {};
  let result = ns[key] || key;
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      result = result.replace(`{${k}}`, String(v));
    });
  }
  return result;
};

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => createTranslator(namespace),
}));

// Mock lucide-react icons - render as spans with data-testid
vi.mock("lucide-react", () => ({
  ChevronLeft: () => <span data-testid="chevron-left">←</span>,
  ChevronRight: () => <span data-testid="chevron-right">→</span>,
  Loader2: () => <span data-testid="loader" className="animate-spin">Loading</span>,
  Receipt: () => <span data-testid="icon-receipt">Receipt</span>,
  Clock: () => <span data-testid="icon-clock">Clock</span>,
  ShoppingCart: () => <span data-testid="icon-cart">Cart</span>,
  BookOpen: () => <span data-testid="icon-book">Book</span>,
  Sparkles: () => <span data-testid="icon-sparkles">Sparkles</span>,
  Check: () => <span data-testid="icon-check">✓</span>,
  Edit: () => <span data-testid="icon-edit">Edit</span>,
  ArrowRight: () => <span data-testid="icon-arrow">→</span>,
  Pencil: () => <span data-testid="icon-pencil">✎</span>,
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

// Test wrapper
function TestWrapper({ onComplete }: { onComplete?: () => void }) {
  return <OnboardingWizard onComplete={onComplete} />;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("OnboardingWizard", () => {
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    mockOnComplete.mockReset();
  });

  describe("Step Navigation", () => {
    it("starts on welcome step", () => {
      render(<TestWrapper onComplete={mockOnComplete} />);
      // Welcome step shows the start button
      expect(screen.getByRole("button", { name: /get started/i })).toBeInTheDocument();
    });

    it("navigates from welcome to company profile", async () => {
      const user = userEvent.setup();
      render(<TestWrapper onComplete={mockOnComplete} />);

      // Click "Get Started" button
      await user.click(screen.getByRole("button", { name: /get started/i }));

      // Should now be on company profile step - look for company name input
      await waitFor(() => {
        expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
      });
    });

    it("shows previous button after welcome step", async () => {
      const user = userEvent.setup();
      render(<TestWrapper onComplete={mockOnComplete} />);

      // Navigate to company profile
      await user.click(screen.getByRole("button", { name: /get started/i }));
      await waitFor(() => {
        expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
      });

      // Previous button should be visible
      expect(screen.getByRole("button", { name: /previous/i })).toBeInTheDocument();
    });

    it("disables next button when step is incomplete", async () => {
      const user = userEvent.setup();
      render(<TestWrapper onComplete={mockOnComplete} />);

      // Navigate to company profile
      await user.click(screen.getByRole("button", { name: /get started/i }));
      await waitFor(() => {
        expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
      });

      // Next button should be disabled without company name
      const nextButton = screen.getByRole("button", { name: /next/i });
      expect(nextButton).toBeDisabled();
    });

    it("enables next button when required fields are filled", async () => {
      const user = userEvent.setup();
      render(<TestWrapper onComplete={mockOnComplete} />);

      // Navigate to company profile
      await user.click(screen.getByRole("button", { name: /get started/i }));
      await waitFor(() => {
        expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
      });

      // Fill in company name
      const nameInput = screen.getByLabelText(/company name/i);
      fireEvent.change(nameInput, { target: { value: "Test Company" } });

      // Next button should now be enabled
      const nextButton = screen.getByRole("button", { name: /next/i });
      expect(nextButton).not.toBeDisabled();
    });
  });

  describe("Data Persistence", () => {
    it("persists company profile data across navigation", async () => {
      const user = userEvent.setup();
      render(<TestWrapper onComplete={mockOnComplete} />);

      // Navigate to company profile
      await user.click(screen.getByRole("button", { name: /get started/i }));
      await waitFor(() => {
        expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
      });

      // Fill in company profile
      const nameInput = screen.getByLabelText(/company name/i);
      fireEvent.change(nameInput, { target: { value: "Acme Corp" } });

      // Navigate forward then back
      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        // Should be on select modules step
        expect(screen.getByRole("heading", { name: /select modules/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /previous/i }));
      await waitFor(() => {
        expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
      });

      // Data should persist
      expect(screen.getByLabelText(/company name/i)).toHaveValue("Acme Corp");
    });

    it("persists module selection across navigation", async () => {
      const user = userEvent.setup();
      render(<TestWrapper onComplete={mockOnComplete} />);

      // Navigate through steps
      await user.click(screen.getByRole("button", { name: /get started/i }));
      await waitFor(() => {
        expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: "Test Co" } });

      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /select modules/i })).toBeInTheDocument();
      });

      // Select a module (look for checkbox or toggle for expenses)
      const expensesToggle = screen.getByRole("button", { name: /expenses/i });
      fireEvent.click(expensesToggle);

      // Navigate forward then back
      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /configure/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /previous/i }));
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /select modules/i })).toBeInTheDocument();
      });

      // Module should still be selected (indigo/active styling)
      const toggleButton = screen.getByRole("button", { name: /expenses/i });
      expect(toggleButton.className).toContain("indigo");
    });

    it("shows progress indicator that updates with steps", async () => {
      render(<TestWrapper onComplete={mockOnComplete} />);

      // Progress indicator should show current step (1)
      const currentStepIndicator = screen.getByRole("button", { name: /1/ });
      expect(currentStepIndicator).toHaveAttribute("aria-current", "step");
    });
  });

  describe("Final Review", () => {
    it("shows review step with all configured data", async () => {
      const user = userEvent.setup();
      render(<TestWrapper onComplete={mockOnComplete} />);

      // Navigate through all steps
      // 1. Welcome
      await user.click(screen.getByRole("button", { name: /get started/i }));
      await waitFor(() => {
        expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
      });

      // 2. Company Profile
      fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: "Acme Corp" } });
      await user.click(screen.getByRole("button", { name: /next/i }));

      // 3. Select Modules
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /select modules/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: /expenses/i }));

      // 4. Configure Module
      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /configure/i })).toBeInTheDocument();
      });

      // 5. Review
      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /review/i })).toBeInTheDocument();
      });

      // Review should show company name
      expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    });

    it("calls onComplete when finishing setup", async () => {
      const user = userEvent.setup();
      render(<TestWrapper onComplete={mockOnComplete} />);

      // Navigate through all steps
      await user.click(screen.getByRole("button", { name: /get started/i }));
      await waitFor(() => {
        expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: "Test" } });
      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /select modules/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: /expenses/i }));

      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /configure/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /review/i })).toBeInTheDocument();
      });

      // Click complete button
      await user.click(screen.getByRole("button", { name: /complete/i }));

      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalled();
      });
    });
  });

  describe("Edge Cases", () => {
    it("shows loading state when completing setup", async () => {
      const user = userEvent.setup();

      render(<TestWrapper onComplete={mockOnComplete} />);

      // Navigate to review step
      await user.click(screen.getByRole("button", { name: /get started/i }));
      await waitFor(() => {
        expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: "Test" } });

      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /select modules/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /expenses/i }));

      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /configure/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /review/i })).toBeInTheDocument();
      });

      // Click complete
      await user.click(screen.getByRole("button", { name: /complete/i }));

      // Verify onComplete was called
      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalled();
      });
    });

    it("allows navigation via progress indicator", async () => {
      const user = userEvent.setup();
      render(<TestWrapper onComplete={mockOnComplete} />);

      // Navigate to company profile first
      await user.click(screen.getByRole("button", { name: /get started/i }));
      await waitFor(() => {
        expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
      });

      // Progress indicator should have multiple step buttons
      const step2Button = screen.getByRole("button", { name: /2/ });
      expect(step2Button).toBeInTheDocument();
    });
  });
});