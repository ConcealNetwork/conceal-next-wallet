"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DICTIONARIES } from "@/lib/i18n/dictionaries";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  type Locale,
  resolveLocale,
  translate,
} from "@/lib/i18n/i18n";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

// Track keys already warned about so a missing translation logs once per key
// rather than on every render. Dev-only — never runs in a production build.
const warnedMissingKeys = new Set<string>();

function warnMissingKey(key: string, locale: Locale): void {
  if (warnedMissingKeys.has(key)) return;
  warnedMissingKeys.add(key);
  console.warn(`[i18n] Missing translation for "${key}" (locale "${locale}"); rendering raw key.`);
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Match SSR (default) on first render to avoid a hydration mismatch; the real
  // locale is read from storage / the browser in the mount effect.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    } catch {
      // storage unavailable → fall back to browser languages
    }
    // navigator.languages can be undefined in privacy/legacy modes — fall back to
    // the single navigator.language so detection still works.
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    const langs = nav?.languages ?? (nav?.language ? [nav.language] : []);
    setLocaleState(resolveLocale(stored, langs));
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // non-fatal — the choice just won't persist
    }
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    // Fall back to the default dictionary if a locale ever lacks one (e.g. a new
    // LOCALES entry added before its dictionary) — never pass undefined to translate.
    const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
    const fallback = DICTIONARIES[DEFAULT_LOCALE];
    return {
      locale,
      setLocale,
      t: (key, vars) => {
        // Dev-only visibility: warn once we hit a key absent from both the active
        // locale and the English fallback, so missing translations surface during
        // development instead of silently rendering the raw key. Stripped in prod.
        if (
          process.env.NODE_ENV !== "production" &&
          !Object.hasOwn(dict, key) &&
          !Object.hasOwn(fallback, key)
        ) {
          warnMissingKey(key, locale);
        }
        return translate(dict, fallback, key, vars);
      },
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
