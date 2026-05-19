"use client";

import {
  Children,
  createContext,
  isValidElement,
  useContext,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

interface TabsCtx {
  value: string;
  onChange: (v: string) => void;
}
const Ctx = createContext<TabsCtx | null>(null);

export function Tabs({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Ctx.Provider value={{ value, onChange }}>
      <div className={cn("flex flex-col", className)}>{children}</div>
    </Ctx.Provider>
  );
}

export function TabList({ children }: { children: ReactNode }) {
  return (
    <div
      role="tablist"
      className="flex gap-1 border-b border-subtle px-1"
    >
      {children}
    </div>
  );
}

export function Tab({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Tab must be used inside Tabs");
  const active = ctx.value === value;
  return (
    <button
      role="tab"
      aria-selected={active}
      aria-controls={`panel-${value}`}
      id={`tab-${value}`}
      tabIndex={active ? 0 : -1}
      onClick={() => ctx.onChange(value)}
      className={cn(
        "px-3 h-8 text-[11px] font-medium uppercase tracking-widest",
        "border-b-2 -mb-px transition-colors",
        active
          ? "bg-accent-muted/70 text-primary"
          : "border-transparent text-tertiary hover:text-secondary",
      )}
    >
      {children}
    </button>
  );
}

export function TabPanels({ children }: { children: ReactNode }) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("TabPanels must be used inside Tabs");
  // Only render the active panel.
  const panels = Children.toArray(children).filter(
    (c) =>
      isValidElement<{ value?: string }>(c) && c.props.value === ctx.value,
  );
  return <div className="pt-3">{panels}</div>;
}

export function TabPanel({
  value: _value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return <div role="tabpanel" id={`panel-${_value}`} aria-labelledby={`tab-${_value}`}>{children}</div>;
}
