/**
 * Diagnostic/runtime flags for the sync path, toggled via localStorage so a dev or user can flip
 * them in the browser console without a rebuild. Engine-free (localStorage only); SSR/static-export
 * safe (guards `typeof localStorage`).
 *
 *   localStorage["ccx-sync-timing"] = "1"          → log per-sync timing (see runtime.ts syncOnce)
 *   localStorage["ccx-disable-parallel-sync"] = "1" → force the LIGHT single-node path even on a deep
 *                                                     catch-up (kill-switch to A/B the speed options)
 *   localStorage["ccx-enable-worker-scan"] = "1"   → OPT IN to the Phase-3 worker-pool scan fold.
 *                                                     OFF by default: the Turbopack worker chunk fails
 *                                                     to bootstrap ("Missing worker bootstrap config")
 *                                                     when the PWA service worker serves it without the
 *                                                     `?params=` the worker runtime needs, which stalled
 *                                                     every batch ~60s before falling back in-thread.
 *                                                     Disabled, the fold runs in-thread (correct + the
 *                                                     original speed); the deep-sync win is multi-source
 *                                                     FETCH parallelism, which is unaffected.
 */
function readFlag(name: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(name) === "1";
  } catch {
    return false;
  }
}

/** True when per-sync timing should be logged to the console. */
export function syncTimingEnabled(): boolean {
  return readFlag("ccx-sync-timing");
}

/** True when the parallel speed path (multi-source + verification + worker pool) is force-disabled. */
export function parallelSyncDisabled(): boolean {
  return readFlag("ccx-disable-parallel-sync");
}

/**
 * True when the Phase-3 worker-pool scan fold is opted IN. Default OFF — see the module header: the
 * Turbopack worker chunk currently can't bootstrap under the PWA service worker, so the in-thread
 * fold (correct, original speed) is the safe default and the pool is strictly an opt-in experiment.
 */
export function workerScanEnabled(): boolean {
  return readFlag("ccx-enable-worker-scan");
}
