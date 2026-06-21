/**
 * Diagnostic/runtime flags for the sync path, toggled via localStorage so a dev or user can flip
 * them in the browser console without a rebuild. Engine-free (localStorage only); SSR/static-export
 * safe (guards `typeof localStorage`).
 *
 *   localStorage["ccx-sync-timing"] = "1"          → log per-sync timing (see runtime.ts syncOnce)
 *   localStorage["ccx-disable-parallel-sync"] = "1" → force the LIGHT single-node path even on a deep
 *                                                     catch-up (kill-switch to A/B the speed options)
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
