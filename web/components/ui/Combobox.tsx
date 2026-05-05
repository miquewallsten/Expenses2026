"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/cn";

export interface ComboOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  value: string | null;
  onChange: (v: string | null) => void;
  options: ComboOption[];
  placeholder?: string;
  invalid?: boolean;
  className?: string;
  /** When true, allows clearing the selection. */
  clearable?: boolean;
  disabled?: boolean;
}

/** Searchable single-select. Native-feeling, no portal, scoped open state. */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  invalid,
  className,
  clearable = true,
  disabled,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [query, options]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: Event) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function commit(opt: ComboOption | null) {
    onChange(opt ? opt.value : null);
    setOpen(false);
    setQuery("");
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (filtered[activeIndex]) {
        e.preventDefault();
        commit(filtered[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex items-center h-8 rounded-md border bg-surface-1",
          "border-subtle",
          invalid && "border-red-500/50",
          disabled && "opacity-60 cursor-not-allowed",
        )}
      >
        <input
          aria-expanded={open}
          aria-autocomplete="list"
          disabled={disabled}
          value={open ? query : selected?.label ?? ""}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          className="flex-1 h-full px-2.5 bg-transparent text-xs text-primary placeholder:text-muted focus:outline-none"
        />
        {clearable && selected && !disabled && (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => commit(null)}
            className="px-2 text-muted hover:text-secondary text-xs"
          >
            ×
          </button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div
          role="listbox"
          className="absolute mt-1 z-40 w-full max-h-60 overflow-auto rounded-md border border-subtle bg-surface-1 shadow-xl py-1"
        >
          {filtered.map((opt, i) => (
            <button
              key={opt.value}
              role="option"
              aria-selected={i === activeIndex}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => commit(opt)}
              className={cn(
                "block w-full text-left px-3 h-7 text-[11px] text-secondary",
                i === activeIndex && "bg-surface-2",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
