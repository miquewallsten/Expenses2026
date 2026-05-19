"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Cpu,
  KeyRound,
} from "lucide-react";

const navItems = [
  {
    title: "Agents & Tools",
    href: "/super-admin/agent-center",
    icon: Bot,
  },
  {
    title: "LLM Config",
    href: "/super-admin/llm-config",
    icon: KeyRound,
  },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="grid items-start gap-1 text-sm">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.title}
            href={item.href}
            className={"flex items-center gap-3 rounded-lg px-3 py-2 transition-all " + (
              isActive
                ? "bg-accent-muted text-accent"
                : "text-muted hover:bg-surface-2"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}