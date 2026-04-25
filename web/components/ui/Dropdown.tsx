"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

export interface DropdownProps {
  trigger: ReactElement<{ onClick?: (e: MouseEvent) => void }>;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}

export function Dropdown({
  trigger,
  children,
  align = "start",
  className,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent | Event) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const triggerEl = isValidElement(trigger)
    ? cloneElement(trigger, {
        onClick: (e: MouseEvent) => {
          trigger.props.onClick?.(e);
          setOpen((v) => !v);
        },
      })
    : trigger;

  return (
    <div ref={wrapperRef} className={cn("relative inline-block", className)}>
      {triggerEl}
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute mt-1 z-40 min-w-[160px] rounded-md border border-white/10",
            "bg-zinc-900 shadow-xl py-1",
            align === "end" ? "right-0" : "left-0",
          )}
          onClick={() => setOpen(false)}
        >
          {Children.map(children, (c) => c)}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({
  children,
  onSelect,
  destructive,
  disabled,
}: {
  children: ReactNode;
  onSelect?: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={() => !disabled && onSelect?.()}
      className={cn(
        "block w-full text-left px-3 h-7 text-[11px] disabled:opacity-50",
        destructive
          ? "text-red-300/85 hover:bg-red-500/10"
          : "text-white/70 hover:bg-white/[0.05]",
      )}
    >
      {children}
    </button>
  );
}
