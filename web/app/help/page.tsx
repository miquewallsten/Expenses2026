"use client";

import { HelpCircle, Mail } from "lucide-react";
import { useTranslations } from "next-intl";

export default function HelpPage() {
  const t = useTranslations("help");
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-surface-0 px-6 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-default bg-surface-1 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-muted">
            <HelpCircle className="h-6 w-6 text-accent" />
          </div>
          <h1 className="mb-2 text-sm font-semibold tracking-wide text-primary">{t("title")}</h1>
          <p className="text-xs leading-relaxed text-secondary">{t("body")}</p>
          <div className="mt-5 rounded-lg border border-subtle bg-surface-0 px-4 py-3">
            <div className="flex items-center justify-center gap-2">
              <Mail className="h-3.5 w-3.5 text-muted" />
              <a
                href="mailto:soporte@opsflow.mx"
                className="text-[11px] font-medium text-accent transition-colors hover:text-accent-hover"
              >
                soporte@opsflow.mx
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
