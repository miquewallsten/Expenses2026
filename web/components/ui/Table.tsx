"use client";

import type { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Table({
  className,
  ...rest
}: HTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={cn(
        "w-full text-xs text-left text-white/75 border-collapse",
        className,
      )}
      {...rest}
    />
  );
}

export function THead({
  className,
  ...rest
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "text-[10px] uppercase tracking-widest text-white/45",
        "bg-white/[0.02] border-b border-white/[0.06]",
        className,
      )}
      {...rest}
    />
  );
}

export function TBody({
  className,
  ...rest
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn("divide-y divide-white/[0.05]", className)}
      {...rest}
    />
  );
}

export function TR({
  className,
  ...rest
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("hover:bg-white/[0.03] transition-colors", className)}
      {...rest}
    />
  );
}

export function TH({
  className,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("px-3 h-8 font-medium align-middle", className)}
      {...rest}
    />
  );
}

export function TD({
  className,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("px-3 h-9 align-middle", className)}
      {...rest}
    />
  );
}
