/**
 * Device-local "watch other wallets" preference (#108). When enabled, the app
 * background-syncs the user's UNLOCKED non-active wallets and fires a notification when
 * funds or a message arrive on one you aren't currently viewing — a real battery/network
 * tradeoff (N wallets = N scan loops), so it's opt-in and off by default.
 *
 * Purely-local UI metadata (identical in mock + real mode), so it bypasses the service
 * layer — same pattern as the notifications opt-in. Guards `typeof localStorage` for
 * static-export / SSR safety; reads as `false` when storage is unavailable.
 */
const WATCH_WALLETS_KEY = "ccx-watch-other-wallets";

/**
 * True when the user has opted into background-watching their other unlocked wallets.
 * Reads default to `false` if storage is unavailable OR throws (Safari private mode raises
 * SecurityError on access — #108 review).
 */
export function isWatchOtherWalletsEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(WATCH_WALLETS_KEY) === "true";
  } catch {
    return false;
  }
}

/** Persist the watch-other-wallets intent. No-op when storage is unavailable or throws. */
export function setWatchOtherWalletsEnabled(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(WATCH_WALLETS_KEY, enabled ? "true" : "false");
  } catch {
    // Private-mode SecurityError / QuotaExceededError — silently skip persistence.
  }
}
