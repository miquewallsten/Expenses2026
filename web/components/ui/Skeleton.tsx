"use client";

import { cn } from "@/lib/cn";

export interface SkeletonProps {
  variant?: "line" | "row" | "card" | "circle";
  className?: string;
}

const VARIANTS: Record<NonNullable<SkeletonProps["variant"]>, string> = {
  line: "h-3 w-full rounded",
  row: "h-8 w-full rounded-md",
  card: "h-24 w-full rounded-md",
  circle: "h-6 w-6 rounded-full",
};

export function Skeleton({ variant = "line", className }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse bg-white/[0.04]",
        VARIANTS[variant],
        className,
      )}
    />
  );
}
