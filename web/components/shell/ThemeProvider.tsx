"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "dark" | "light" | "system";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

function resolveClass(theme: Theme, systemDark: boolean): "dark" | "light" {
  if (theme === "system") return systemDark ? "dark" : "light";
  return theme;
}

function applyThemeClass(cls: "dark" | "light") {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(cls);
  const metaTag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (metaTag) metaTag.content = cls === "dark" ? "#09090b" : "#fafafa";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem("pref_theme") ?? "dark") as Theme;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    setThemeState(stored);
    applyThemeClass(resolveClass(stored, mq.matches));

    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    applyThemeClass(resolveClass(theme, systemDark));
  }, [theme, systemDark]);

  const setTheme = (next: Theme) => {
    localStorage.setItem("pref_theme", next);
    setThemeState(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
