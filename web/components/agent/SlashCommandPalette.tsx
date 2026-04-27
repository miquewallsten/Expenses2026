"use client";

import { useTranslations } from "next-intl";
import { Zap } from "lucide-react";
import type { SlashCommand } from "./slashCommands";

interface Props {
  commands:    SlashCommand[];
  activeIndex: number;
  onSelect:    (cmd: SlashCommand) => void;
  onHover:     (index: number) => void;
}

/**
 * Slash command palette rendered above the composer when the user
 * types a leading "/". Keyboard navigation is owned by AgentChat;
 * this component is purely visual.
 */
export default function SlashCommandPalette({
  commands, activeIndex, onSelect, onHover,
}: Props) {
  const t = useTranslations("agent.chat.slash");

  if (commands.length === 0) {
    return (
      <div className="mb-1.5 rounded-md border border-white/[0.08] bg-zinc-900/95 px-2.5 py-1.5 text-[10px] text-white/35 shadow-lg shadow-black/40">
        {t("empty")}
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label={t("ariaLabel")}
      className="mb-1.5 max-h-56 overflow-y-auto rounded-md border border-white/[0.08] bg-zinc-900/95 py-1 shadow-lg shadow-black/40"
    >
      {commands.map((cmd, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={cmd.id}
            type="button"
            role="option"
            aria-selected={active}
            onMouseEnter={() => onHover(i)}
            onMouseDown={(e) => { e.preventDefault(); onSelect(cmd); }}
            className={[
              "flex w-full items-start gap-2 px-2.5 py-1.5 text-left transition-colors",
              active
                ? "bg-indigo-500/[0.12] text-white/85"
                : "text-white/55 hover:bg-white/[0.04]",
            ].join(" ")}
          >
            <Zap
              className={[
                "mt-0.5 h-3 w-3 shrink-0",
                active ? "text-indigo-300" : "text-white/30",
              ].join(" ")}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] tracking-tight text-indigo-300/80">
                  /{cmd.id}
                </span>
                <span className="truncate text-[11px] font-medium">
                  {t(`${cmd.labelKey}` as never)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[10px] text-white/35">
                {t(`${cmd.descKey}` as never)}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
