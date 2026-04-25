"use client";

import { useTranslations } from "next-intl";

export default function HelpPage() {
  const t = useTranslations("help");
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center px-6 py-10">
      <div className="max-w-md text-center">
        <h1 className="mb-2 text-sm font-semibold tracking-wide text-white/75">{t("title")}</h1>
        <p className="text-xs leading-relaxed text-white/45">{t("body")}</p>
        <p className="mt-3 text-[11px] text-white/30">
          <a href="mailto:soporte@opsflow.mx" className="text-indigo-300/80 hover:text-indigo-200">
            soporte@opsflow.mx
          </a>
        </p>
      </div>
    </div>
  );
}
