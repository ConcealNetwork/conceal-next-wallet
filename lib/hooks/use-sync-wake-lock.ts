"use client";

import { useEffect, useRef } from "react";

/**
 * Hold a screen wake lock while the wallet is doing a long sync so the device
 * doesn't sleep mid-scan (which would stall the sync). Released the moment
 * syncing stops.
 *
 * Progressive enhancement: feature-detected (`"wakeLock" in navigator`) and the
 * request is wrapped in try/catch — the API rejects when the page isn't visible
 * or the UA declines, so a failure is a silent no-op. The OS drops a wake lock
 * whenever the tab is hidden, so we re-acquire on `visibilitychange → visible`
 * while still syncing. No-op in mock mode (sync never runs) and on SSR.
 *
 * @param active true while an initial/long sync is in progress.
 */
export function useSyncWakeLock(active: boolean): void {
  // The live sentinel, kept in a ref so acquire/release/re-acquire all target
  // the same lock without re-running the effect on every render.
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let cancelled = false;
    // Guards against overlapping requests: acquire() can be re-entered (active
    // flip + visibilitychange firing close together) before the first in-flight
    // request resolves; without this both would create independent sentinels and
    // only the last would be stored/released — leaking the earlier lock.
    let acquiring = false;

    const release = () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel) void sentinel.release().catch(() => {});
    };

    const acquire = async () => {
      // Already holding one, mid-request, no longer needed, or document hidden → skip.
      if (sentinelRef.current || acquiring || !active) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      acquiring = true;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        // The effect may have torn down (sync finished / unmount) while the
        // request was in flight — don't keep a lock nobody will release.
        if (cancelled || !active) {
          void sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        // The browser auto-releases on tab hide; clear our ref so the
        // visibility handler re-acquires when the tab returns.
        sentinel.addEventListener("release", () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null;
        });
      } catch {
        // Rejected (not focused / not permitted) — no-op, best-effort only.
      } finally {
        acquiring = false;
      }
    };

    if (active) {
      void acquire();
    } else {
      release();
    }

    const onVisible = () => {
      if (document.visibilityState === "visible" && active) void acquire();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }

    return () => {
      cancelled = true;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
      release();
    };
  }, [active]);
}
