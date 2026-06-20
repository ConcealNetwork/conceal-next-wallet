"use client";

import { useEffect, useRef } from "react";

/**
 * Opens a page's create flow when the sidebar quick-create "+" deep-links here
 * with `?new=1`. Reads the query once on mount via `window.location.search`
 * (client-only — safe for the static export, no Suspense boundary needed), fires
 * `onCreate`, then strips the param so a reload or back-nav doesn't re-open it.
 */
export function useCreateDeepLink(onCreate: () => void) {
  const handler = useRef(onCreate);
  handler.current = onCreate;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") !== "1") return;

    handler.current();

    params.delete("new");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (query ? `?${query}` : "") + window.location.hash,
    );
  }, []);
}
