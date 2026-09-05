"use client";

import { useEffect } from "react";
import { env } from "@/lib/env";
import { services } from "@/lib/services";

/**
 * Persist in-memory deep-sync progress when the tab hides so a discarded
 * background tab (or refresh) resumes from the last checkpoint, not the
 * last end-of-loop write. No-op in mock mode (no engine / scan cursor).
 */
export function useSyncCheckpoint(): void {
  useEffect(() => {
    if (env.useMockWallet) return;

    const onHide = () => {
      void services.wallet.flushSyncCheckpoint().catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);
}
