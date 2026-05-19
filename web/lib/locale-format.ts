"use client";

import { useLocale, type Locale } from "@/context/LocaleContext";

const DATE_LOCALE: Record<Locale, Intl.LocalesArgument> = { en: "en-US", es: "es-MX" };
const CURRENCY: Record<Locale, { locale: Intl.LocalesArgument; code: string }> = {
  en: { locale: "en-US", code: "USD" },
  es: { locale: "es-MX", code: "MXN" },
};

export function useLocaleFormat() {
  const { locale } = useLocale();
  const dl = DATE_LOCALE[locale];
  const { locale: cl, code } = CURRENCY[locale];

  const formatDate = (iso: string, opts?: Intl.DateTimeFormatOptions) => {
    const d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) return " - ";
    return d.toLocaleDateString(dl as Intl.LocalesArgument, opts);
  };

  const formatDateTime = (iso: string, opts?: Intl.DateTimeFormatOptions) => {
    const d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) return " - ";
    return d.toLocaleString(dl as Intl.LocalesArgument, opts);
  };

  const formatCurrency = (n: number, opts?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(cl, { style: "currency", currency: code, ...opts }).format(n);

  const formatNumber = (n: number, opts?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(dl as Intl.LocalesArgument, opts).format(n);

  return { locale, dateLocale: dl, currencyLocale: cl, currency: code, formatDate, formatDateTime, formatCurrency, formatNumber };
}

/** For module-level constants that can't use hooks. */
export function fmtCurrencyFor(n: number, locale: Locale = "es") {
  const { locale: cl, code } = CURRENCY[locale];
  return new Intl.NumberFormat(cl, { style: "currency", currency: code }).format(n);
}

export function fmtDateFor(iso: string, locale: Locale = "es", opts?: Intl.DateTimeFormatOptions) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return " - ";
  return d.toLocaleDateString(DATE_LOCALE[locale] as Intl.LocalesArgument, opts);
}
