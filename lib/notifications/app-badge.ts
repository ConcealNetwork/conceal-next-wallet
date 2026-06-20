/**
 * App icon badging (installed-PWA dock/home-screen badge). Progressive
 * enhancement: feature-detected and wrapped in try/catch so it's a silent
 * no-op when unsupported (most desktop browsers, all of Firefox) or off the
 * main thread. Pure UI metadata: no `wallet-core` import, no service spine.
 *
 * The badge mirrors the count of *actionable* items the app already computes
 * (overdue check-ins + due payment reminders); it carries no string, so there's
 * nothing to localize.
 */

/** True when the Badging API is available on this browser. */
export function isAppBadgeSupported(): boolean {
  return typeof navigator !== "undefined" && "setAppBadge" in navigator;
}

/**
 * Reflect `count` on the installed-app icon: set the badge when positive, clear
 * it when zero (or negative/NaN). Never throws — `setAppBadge` returns a promise
 * that can reject (e.g. permission revoked), so the rejection is swallowed.
 */
export function updateAppBadge(count: number): void {
  if (!isAppBadgeSupported()) return;
  try {
    if (Number.isFinite(count) && count > 0) {
      void navigator.setAppBadge(count).catch(() => {});
    } else {
      void navigator.clearAppBadge?.().catch(() => {});
    }
  } catch {
    // Synchronous throw (older/partial implementations) — never surface it.
  }
}

/** Remove the badge unconditionally (e.g. on unmount / wallet lock). */
export function clearAppBadge(): void {
  if (!isAppBadgeSupported()) return;
  try {
    void navigator.clearAppBadge?.().catch(() => {});
  } catch {
    // Never surface a clear failure.
  }
}
