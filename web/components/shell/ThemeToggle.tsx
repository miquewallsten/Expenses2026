"use client";

import { useTheme } from "./ThemeProvider";
import { Sun, Moon, Monitor } from "lucide-react";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const cycle = () => {
    if (theme === "dark") setTheme("light");
    else if (theme === "light") setTheme("system");
    else setTheme("dark");
  };

  const IconComponent = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <button
      type="button"
      onClick={cycle}
      className="flex h-7 w-7 items-center justify-center rounded text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
      aria-label={theme === "dark" ? "Switch to light theme" : theme === "light" ? "Switch to system theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System"}
    >
      <IconComponent className="h-3.5 w-3.5" />
    </button>
  );
}
