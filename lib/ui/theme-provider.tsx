"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  normalizeThemePreference,
  type ResolvedTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/ui/theme";

// useLayoutEffect on the client (DOM mutations flush before paint → no flash),
// useEffect on the server (avoids React's "useLayoutEffect does nothing on the
// server" warning during SSR/prerender).
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** Reflect the resolved theme onto <html> — keep in sync with the no-FOUC script. */
function applyResolvedTheme(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Match the server/no-FOUC default (dark) on first render to avoid hydration
  // mismatch; the real preference is read from storage in the mount effect.
  const [preference, setPreferenceState] = useState<ThemePreference>("dark");
  const [resolved, setResolved] = useState<ResolvedTheme>("dark");

  // Layout effect so the real preference + resolved theme are read and applied
  // before the browser paints — no flash for users whose stored theme isn't dark.
  useIsomorphicLayoutEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // storage unavailable → fall back to system
    }
    const initial = normalizeThemePreference(stored);
    setPreferenceState(initial);
    setResolved(resolveTheme(initial, systemPrefersDark()));
  }, []);

  // Track system changes while following "system".
  useEffect(() => {
    if (preference !== "system" || typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(resolveTheme("system", media.matches));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  useIsomorphicLayoutEffect(() => {
    applyResolvedTheme(resolved);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    setResolved(resolveTheme(next, systemPrefersDark()));
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // non-fatal — the choice just won't persist
    }
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
