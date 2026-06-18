"use client";

import { useMemo } from "react";
import type { Locale } from "@/lib/i18n/i18n";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { CcxAmount, UsdAmount } from "@/lib/types";
import {
  CCX_HUMAIN_DECIMAL_DISPLAY,
  formatCcx as formatCcxBase,
  formatUsd as formatUsdBase,
  timeAgo as timeAgoBase,
} from "@/lib/utils";

/**
 * Map a UI `Locale` to the BCP-47 tag the native `Intl` APIs expect. `en` is
 * intentionally `en-US` (not bare `en`) so the hook reproduces the wallet's
 * source-language output exactly when the active locale is English.
 */
const LOCALE_TO_BCP47: Record<Locale, string> = {
  en: "en-US",
  es: "es-ES",
};

export function localeToBcp47(locale: Locale): string {
  return LOCALE_TO_BCP47[locale] ?? "en-US";
}

/** Locale-aware presentation helpers bound to the active UI locale. */
export interface Formatters {
  /** BCP-47 tag the formatters are bound to (e.g. `"es-ES"`). */
  readonly locale: string;
  /** CCX amount with locale grouping/decimal separators + display ticker. */
  formatCcx: (amount: CcxAmount | number, decimals?: number, trimTrailingZeros?: boolean) => string;
  /** USD amount with locale grouping/decimal separators. */
  formatUsd: (amount: UsdAmount | number, decimals?: number) => string;
  /** Compact relative time via `Intl.RelativeTimeFormat` (e.g. `"hace 5 min"`). */
  timeAgo: (date: string | Date, now?: Date) => string;
  /** A plain integer with locale grouping (e.g. block heights). */
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** Format a date with the supplied `Intl.DateTimeFormat` options. */
  formatDate: (date: Date | number, options?: Intl.DateTimeFormatOptions) => string;
}

/**
 * Returns presentation formatters bound to the active UI locale. Amounts, dates,
 * and relative time follow `Intl` for the current locale (e.g. `1.234,56 CCX` and
 * `hace 5 min` in Spanish) instead of the hardcoded-English bare helpers.
 *
 * Pluralization beyond what `Intl.RelativeTimeFormat`/`Intl.NumberFormat` provide
 * (full ICU message pluralization) is intentionally out of scope for this pass.
 */
export function useFormatters(): Formatters {
  const { locale } = useI18n();

  return useMemo<Formatters>(() => {
    const bcp47 = localeToBcp47(locale);
    return {
      locale: bcp47,
      formatCcx: (amount, decimals = CCX_HUMAIN_DECIMAL_DISPLAY, trimTrailingZeros = false) =>
        formatCcxBase(amount, decimals, trimTrailingZeros, bcp47),
      formatUsd: (amount, decimals = 4) => formatUsdBase(amount, decimals, bcp47),
      timeAgo: (date, now = new Date()) => timeAgoBase(date, now, bcp47),
      formatNumber: (value, options) => value.toLocaleString(bcp47, options),
      formatDate: (date, options) => new Intl.DateTimeFormat(bcp47, options).format(date),
    };
  }, [locale]);
}
