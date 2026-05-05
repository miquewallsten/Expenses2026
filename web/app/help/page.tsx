"use client";

import { useTranslations } from "next-intl";

export default function HelpPage() {
  const t = useTranslations("help");
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center px-6 py-10">
      <div className="max-w-md text-center">
        <h1 className="mb-2 text-sm font-semibold tracking-wide text-secondary">{t("title")}</h1>
        <p className="text-xs leading-relaxed text-tertiary">{t("body")}</p>
        <p className="mt-3 text-[11px] text-muted">
          <a href="mailto:soporte@opsflow.mx" className="text-accent hover:text-accent">
            soporte@opsflow.mx
          </a>
        </p>
      </div>
    </div>
  );
}
