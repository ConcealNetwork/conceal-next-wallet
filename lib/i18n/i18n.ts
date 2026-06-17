/**
 * Lightweight, dependency-free i18n for the static export. Dictionaries are
 * bundled (no async loading), so `t()` is synchronous; missing keys/locales fall
 * back to English. This is the foundation — a high-value subset of strings (nav,
 * common actions) is translated to start; more strings and locales are drop-in.
 */

export type Locale = "en" | "es";

export const LOCALES: readonly { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "ccx-locale";

export type Dictionary = Record<string, string>;

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "es";
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
