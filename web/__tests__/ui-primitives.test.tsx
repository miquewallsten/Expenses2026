/**
 * Phase 3.1 — UI primitives smoke tests.
 *
 * Verifies primitives render, expose their accessibility roles, and respond
 * to basic interactions. Not a full visual regression suite — that lives
 * in the dev catalog page.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { Skeleton } from "../components/ui/Skeleton";
import { Tooltip } from "../components/ui/Tooltip";
import { Modal } from "../components/ui/Modal";
import { ToastProvider, useToast } from "../components/ui/Toast";

describe("Button", () => {
  it("renders children and fires onClick", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disables when loading", () => {
    render(<Button loading>Submit</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("shows loading spinner when loading", () => {
    const { container } = render(<Button loading>Submit</Button>);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("applies variant classes correctly", () => {
    const { rerender } = render(<Button variant="primary">Primary</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-accent");

    rerender(<Button variant="secondary">Secondary</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-surface-2");

    rerender(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-transparent");

    rerender(<Button variant="danger">Danger</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-error");
  });

  it("applies size classes correctly", () => {
    const { rerender } = render(<Button size="xs">XS</Button>);
    expect(screen.getByRole("button")).toHaveClass("h-6");

    rerender(<Button size="sm">SM</Button>);
    expect(screen.getByRole("button")).toHaveClass("h-7");

    rerender(<Button size="md">MD</Button>);
    expect(screen.getByRole("button")).toHaveClass("h-8");
  });

  it("has active press state scale", () => {
    render(<Button>Press</Button>);
    expect(screen.getByRole("button")).toHaveClass("active:scale-[0.97]");
  });

  it("has focus ring styles", () => {
    render(<Button>Focus</Button>);
    expect(screen.getByRole("button")).toHaveClass("focus-visible:ring-2");
  });
});

describe("Input", () => {
  it("renders and supports controlled change", () => {
    const onChange = vi.fn();
    render(<Input value="x" onChange={onChange} placeholder="email" />);
    fireEvent.change(screen.getByPlaceholderText("email"), {
      target: { value: "y" },
    });
    expect(onChange).toHaveBeenCalled();
  });

  it("flags invalid via aria-invalid", () => {
    render(<Input invalid placeholder="z" />);
    expect(screen.getByPlaceholderText("z")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("has focus ring styles", () => {
    render(<Input placeholder="focus" />);
    expect(screen.getByPlaceholderText("focus")).toHaveClass("focus:ring-2");
    expect(screen.getByPlaceholderText("focus")).toHaveClass("focus:ring-indigo-400/20");
  });

  it("has invalid focus ring styles", () => {
    render(<Input invalid placeholder="invalid" />);
    expect(screen.getByPlaceholderText("invalid")).toHaveClass("focus:ring-red-400/20");
  });

  it("has transition styles", () => {
    render(<Input placeholder="trans" />);
    expect(screen.getByPlaceholderText("trans")).toHaveClass("transition-colors");
  });
});

describe("EmptyState / ErrorState / Skeleton", () => {
  it("renders empty state title and action", () => {
    render(
      <EmptyState
        title="No data"
        description="Try later"
        action={<button>Retry</button>}
      />,
    );
    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("renders error state with retry", () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} requestId="abc123" />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });

  it("renders skeleton with hidden aria", () => {
    const { container } = render(<Skeleton variant="row" />);
    expect(container.firstChild).toHaveAttribute("aria-hidden");
  });
});

describe("Tooltip", () => {
  it("shows tooltip on hover", () => {
    render(
      <Tooltip content="hello">
        <span>trigger</span>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByText("trigger").parentElement!);
    expect(screen.getByRole("tooltip")).toHaveTextContent("hello");
  });
});

describe("Modal", () => {
  it("renders when open and closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal open title="hi" onClose={onClose}>
        <div>body</div>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    render(
      <Modal open={false} onClose={() => {}}>
        body
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Toast", () => {
  function Probe() {
    const t = useToast();
    return (
      <button onClick={() => t.success("Saved")}>fire</button>
    );
  }
  it("shows a toast when fired", () => {
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "fire" }));
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });
});
