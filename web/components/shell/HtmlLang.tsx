"use client";

import { useLocale } from "@/context/LocaleContext";
import { useEffect } from "react";

/**
 * Syncs <html lang> with the current locale.
 * Since RootLayout is a server component, we keep `lang="es"` as the
 * initial value (matching the default locale) and update it client-side.
 */
export default function HtmlLang() {
  const { locale } = useLocale();

  useEffect(() => {
    document.documentElement.lang = locale === "en" ? "en" : "es";
  }, [locale]);

  return null;
}
