"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Opens a page's create flow when the sidebar quick-create "+" deep-links here
 * with `?new=1`, then strips the param so a reload / back-nav doesn't re-open it.
 *
 * Watches `useSearchParams` (not just mount) so clicking the sidebar "+" for the
 * page you are ALREADY on — which changes the URL without remounting — still opens
 * the dialog. SSR/static-export safe: these are client pages and the param is read
 * reactively, never at module init.
 */
export function useCreateDeepLink(onCreate: () => void) {
  const handler = useRef(onCreate);
  handler.current = onCreate;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const newParam = searchParams.get("new");

  useEffect(() => {
    if (newParam !== "1") return;
    handler.current();

    // Strip `new` so a refresh / back-nav doesn't re-trigger the create flow.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      pathname + (query ? `?${query}` : "") + window.location.hash,
    );
  }, [newParam, pathname, searchParams]);
}
