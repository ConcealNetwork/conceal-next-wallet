/**
 * Lightweight, dependency-free i18n for the static export. Dictionaries are
 * bundled (no async loading), so `t()` is synchronous; missing keys/locales fall
 * back to English. This is the foundation — a high-value subset of strings (nav,
 * common actions) is translated to start; more strings and locales are drop-in.
 */

export type Locale = "en" | "es" | "fr" | "de" | "it" | "pt" | "ru" | "zh" | "ja" | "ko";

export const LOCALES: readonly { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "ru", label: "Русский" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "ccx-locale";

export type Dictionary = Record<string, string>;

const LOCALE_CODES: ReadonlySet<Locale> = new Set(LOCALES.map((l) => l.code));

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALE_CODES.has(value as Locale);
}

/**
 * Resolve the active locale: an explicit stored choice wins; otherwise match the
 * first supported browser language; otherwise the default.
 */
export function resolveLocale(stored: unknown, browserLanguages: readonly string[]): Locale {
  if (isLocale(stored)) return stored;
  for (const lang of browserLanguages) {
    const base = lang.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/**
 * Look up `key` in `dict`, falling back to `fallback` (English) then the key
 * itself. `{name}`-style placeholders are replaced from `vars`.
 */
export function translate(
  dict: Dictionary,
  fallback: Dictionary,
  key: string,
  vars?: Record<string, string | number>,
): string {
  // Object.hasOwn (not `dict[key]` / `name in vars`) so prototype members like
  // "valueOf"/"toString" can't be returned as a "translation" or interpolated.
  const template = Object.hasOwn(dict, key)
    ? dict[key]
    : Object.hasOwn(fallback, key)
      ? fallback[key]
      : key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : match,
  );
}
