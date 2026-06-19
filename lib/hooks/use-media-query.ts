"use client";

import { useEffect, useState } from "react";

/**
 * SSR/static-export-safe media query hook. Starts `false` so the server render
 * and first client render agree (no hydration mismatch); the real value is read
 * in an effect after mount and updated on subsequent breakpoint changes.
 *
 * Used to branch behaviour by viewport — e.g. show transaction detail in the
 * contextual rail at >=1200px (where the rail is visible) vs the dialog below it.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
