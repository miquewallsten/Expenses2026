"use client";

import React from "react";

/**
 * Render message content with markdown-like formatting:
 * - **bold** → <strong>
 * - - item → bullet list
 * - 1. item → numbered list
 * - Line breaks → proper spacing
 */

type ListType = "bullet" | "number" | null;

interface RenderOptions {
  textClassName?: string;
  boldClassName?: string;
  bulletClassName?: string;
  numberClassName?: string;
  listClassName?: string;
}

export function renderContent(
  content: string,
  options: RenderOptions = {}
): React.ReactNode[] {
  const {
    textClassName = "mb-2 last:mb-0 text-white/60 leading-relaxed",
    boldClassName = "font-semibold text-white/75",
    bulletClassName = "text-white/50 text-[11px] leading-relaxed",
    numberClassName = "text-white/50 text-[11px] leading-relaxed",
    listClassName = "mb-2",
  } = options;

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listType: ListType = null;
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      const ListTag = listType === "number" ? "ol" : "ul";
      const itemClassName = listType === "number" ? numberClassName : bulletClassName;
      elements.push(
        <ListTag
          key={key++}
          className={`${listClassName} ${listType === "number" ? "list-decimal pl-4" : "list-disc pl-4"}`}
        >
          {listItems.map((item, i) => (
            <li key={i} className={itemClassName}>
              {renderInline(item, boldClassName)}
            </li>
          ))}
        </ListTag>
      );
      listItems = [];
      listType = null;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Bullet list
    if (trimmed.startsWith("- ")) {
      if (listType !== "bullet") {
        flushList();
        listType = "bullet";
      }
      listItems.push(trimmed.slice(2));
      continue;
    }

    // Numbered list
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (numberedMatch) {
      if (listType !== "number") {
        flushList();
        listType = "number";
      }
      listItems.push(numberedMatch[2]);
      continue;
    }

    // Flush any pending list
    flushList();

    // Regular paragraph
    if (trimmed) {
      elements.push(
        <p key={key++} className={textClassName}>
          {renderInline(trimmed, boldClassName)}
        </p>
      );
    }
  }

  flushList();
  return elements;
}

function renderInline(text: string, boldClassName: string): React.ReactNode {
  // Handle **bold**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className={boldClassName}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

/**
 * Action button configuration for chat messages
 */
export interface ActionButton {
  label: string;
  value: string;
  icon?: "company" | "users" | "accounting" | "policy" | "check" | "zap" | "upload";
}

/**
 * Loading dots component for chat loading states
 */
export function LoadingDots({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex gap-1 ${className}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400/60"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

/**
 * Message bubble variants for consistent styling
 */
export const bubbleStyles = {
  user: "bg-indigo-500/15 text-indigo-100/90 ring-1 ring-inset ring-indigo-500/20",
  assistant: "bg-white/[0.03] text-white/60 ring-1 ring-inset ring-white/[0.05]",
  error: "border border-rose-500/20 bg-rose-500/[0.08] text-rose-300/80",
  system: "border border-white/[0.06] bg-white/[0.02] text-white/50",
};

/**
 * Chat container styling
 */
export const chatContainerStyles = "flex h-full flex-col bg-zinc-950";

/**
 * Message area styling
 */
export const messageAreaStyles = "min-h-0 flex-1 overflow-y-auto px-4 py-4";

/**
 * Input area styling
 */
export const inputAreaStyles = "shrink-0 border-t border-white/[0.06] bg-zinc-900/30 px-4 py-3";