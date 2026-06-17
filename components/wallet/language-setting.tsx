"use client";

import { isLocale, LOCALES } from "@/lib/i18n/i18n";
import { useI18n } from "@/lib/i18n/i18n-provider";

/** Language switcher for Settings — picks the UI locale (persisted). */
export function LanguageSetting() {
  const { locale, setLocale, t } = useI18n();

  return (
    <select
      className="h-10 w-44 cursor-pointer rounded-xl border border-input bg-background px-3 text-sm text-foreground transition-colors duration-200 hover:border-ring/60 focus:outline-hidden focus:ring-2 focus:ring-ring"
      value={locale}
      aria-label={t("settings.languageAriaLabel")}
      onChange={(event) => {
        // Guard the cast — only accept known locales (defensive vs. tampered DOM).
        if (isLocale(event.target.value)) setLocale(event.target.value);
      }}
    >
      {LOCALES.map(({ code, label }) => (
        <option key={code} value={code}>
          {label}
        </option>
      ))}
    </select>
  );
}
