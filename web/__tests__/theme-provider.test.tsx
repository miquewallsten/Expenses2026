import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../components/shell/ThemeProvider";

// Capture the matchMedia mock so tests can trigger changes
let mqListeners: ((e: Partial<MediaQueryListEvent>) => void)[] = [];
const mockMq = {
  matches: false,
  addEventListener: vi.fn((_: string, fn: (e: Partial<MediaQueryListEvent>) => void) => {
    mqListeners.push(fn);
  }),
  removeEventListener: vi.fn((_: string, fn: (e: Partial<MediaQueryListEvent>) => void) => {
    mqListeners = mqListeners.filter((l) => l !== fn);
  }),
};

beforeEach(() => {
  mqListeners = [];
  mockMq.matches = false;
  vi.stubGlobal("matchMedia", () => mockMq);
  localStorage.clear();
  document.documentElement.classList.remove("dark", "light");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Consumer() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={() => setTheme("light")}>switch-light</button>
      <button onClick={() => setTheme("system")}>switch-system</button>
    </div>
  );
}

describe("ThemeProvider", () => {
  it("defaults to dark when localStorage is empty", () => {
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("reads pref_theme from localStorage on mount", () => {
    localStorage.setItem("pref_theme", "light");
    render(<ThemeProvider><Consumer /></ThemeProvider>);
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("setTheme writes to localStorage and updates the class", async () => {
    const { getByText } = render(<ThemeProvider><Consumer /></ThemeProvider>);
    await act(async () => { getByText("switch-light").click(); });
    expect(localStorage.getItem("pref_theme")).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("system mode uses OS preference (dark)", async () => {
    mockMq.matches = true; // OS is dark
    const { getByText } = render(<ThemeProvider><Consumer /></ThemeProvider>);
    await act(async () => { getByText("switch-system").click(); });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("system mode uses OS preference (light)", async () => {
    mockMq.matches = false; // OS is light
    const { getByText } = render(<ThemeProvider><Consumer /></ThemeProvider>);
    await act(async () => { getByText("switch-system").click(); });
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("system mode re-applies on OS change", async () => {
    mockMq.matches = false;
    const { getByText } = render(<ThemeProvider><Consumer /></ThemeProvider>);
    await act(async () => { getByText("switch-system").click(); });
    expect(document.documentElement.classList.contains("light")).toBe(true);
    // OS switches to dark
    await act(async () => {
      mqListeners.forEach((fn) => fn({ matches: true } as Partial<MediaQueryListEvent>));
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("throws when used outside ThemeProvider", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow("useTheme must be used within a ThemeProvider");
    consoleSpy.mockRestore();
  });
});
