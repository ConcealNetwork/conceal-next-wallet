import { resetPulseDismissed } from "@/lib/storage/pulse-dismiss-store";

/** Removed watcher store — purge if still on disk from pre-Pulse builds. */
const LEGACY_WATCHERS_KEY = "ccx-check-in-watchers";

export type ClearPulseMetaOpts = {
  /** Also reset pulse dismissals (active-wallet delete). */
  dismissals?: boolean;
};

/**
 * Erase pulse UI metadata when a wallet is removed. Always drops the legacy
 * check-in-watchers key; optionally clears dismissals when the active wallet
 * is deleted (non-active delete leaves dismissals — they are tx ids from the
 * wallet still open).
 */
export function clearPulseMeta(opts: ClearPulseMetaOpts = {}): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(LEGACY_WATCHERS_KEY);
  }
  if (opts.dismissals) {
    resetPulseDismissed();
  }
}
