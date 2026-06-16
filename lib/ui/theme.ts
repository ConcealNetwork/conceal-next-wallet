/**
 * The app is dark by default. A light palette is available; the user can pick
 * Light, Dark, or follow the System `prefers-color-scheme`. The resolved theme is
 * applied via a `data-theme` attribute on `<html>` (see globals.css + the no-FOUC
 * script in the root layout).
 */

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "ccx-theme";
export const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

/** Normalize an untrusted stored value to a known preference (default `system`). */
export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

/** The effective theme for a preference, given whether the system prefers dark. */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return systemPrefersDark ? "dark" : "light";
}
