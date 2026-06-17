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
    const langs = typeof navigator !== "undefined" ? navigator.languages : [];
    setLocaleState(resolveLocale(stored, langs ?? []));
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
    const dict = DICTIONARIES[locale];
    const fallback = DICTIONARIES[DEFAULT_LOCALE];
    return {
      locale,
      setLocale,
      t: (key, vars) => translate(dict, fallback, key, vars),
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
