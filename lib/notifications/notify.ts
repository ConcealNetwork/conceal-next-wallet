/**
 * Server-free OS notifications. Strictly **opt-in**: nothing here ever fires
 * unless the user has both granted browser permission *and* flipped the in-app
 * toggle. Toasts remain the default surface; these notifications are additive,
 * so when permission is denied/unsupported behavior is exactly as before.
 *
 * Everything is feature-detected and wrapped in try/catch — no function here
 * ever throws. Pure UI metadata: no `wallet-core` import, no service spine.
 */

const OPT_IN_KEY = "ccx-notifications-opt-in";

export type NotificationPermissionState = NotificationPermission | "unsupported";

/** True when the browser exposes the Notification API at all. */
export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Current OS permission, or "unsupported" when the API is missing. */
export function getPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return "unsupported";
  try {
    return Notification.permission;
  } catch {
    return "unsupported";
  }
}

/**
 * Whether the user has opted in via the Settings toggle (persisted locally).
 * Independent of OS permission: a user can opt in and still have permission
 * "default" until they accept the browser prompt.
 */
export function isOptedIn(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(OPT_IN_KEY) === "true";
  } catch {
    return false;
  }
}

/** Persist the opt-in flag. */
export function setOptedIn(value: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(OPT_IN_KEY, value ? "true" : "false");
  } catch {
    // Storage may be unavailable (private mode / quota) — never throw.
  }
}

/**
 * Request OS notification permission. MUST be called from a user gesture (a
 * click handler) — browsers reject prompts raised outside one. Resolves to the
 * resulting permission (or "unsupported"); never rejects.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return "unsupported";
  try {
    // Older Safari resolves via callback rather than a promise — normalize both.
    const result = await Notification.requestPermission();
    return result ?? getPermission();
  } catch {
    return getPermission();
  }
}

/** True when notifications can actually be shown right now (granted + supported). */
export function canNotify(): boolean {
  return getPermission() === "granted";
}

/**
 * Show an OS notification, preferring the service-worker registration
 * (`showNotification` — works when the tab is backgrounded and supports
 * `notificationclick`), falling back to the `Notification` constructor. A no-op
 * when unsupported or not granted. Never throws.
 */
export async function notify(title: string, options?: NotificationOptions): Promise<void> {
  if (!canNotify()) return;
  try {
    if (
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator &&
      navigator.serviceWorker?.ready
    ) {
      const registration = await navigator.serviceWorker.ready;
      if (registration && typeof registration.showNotification === "function") {
        await registration.showNotification(title, options);
        return;
      }
    }
  } catch {
    // Fall through to the constructor path below.
  }
  try {
    // eslint-disable-next-line no-new -- side-effecting; the instance isn't needed.
    new Notification(title, options);
  } catch {
    // Constructor can throw (e.g. unsupported in a worker context) — swallow.
  }
}

/**
 * Pure de-dupe helper: given the keys that are "active now" and the set already
 * announced this session, return the keys that are *newly* active (not yet
 * announced). Used to notify at most once per due-instance and to re-evaluate
 * safely on tab-visibility changes without re-alerting unchanged items.
 *
 * Immutable: callers fold the result into the announced set themselves.
 */
export function selectNewKeys(
  currentKeys: readonly string[],
  announced: ReadonlySet<string>,
): string[] {
  const seen = new Set<string>();
  const fresh: string[] = [];
  for (const key of currentKeys) {
    if (announced.has(key) || seen.has(key)) continue;
    seen.add(key);
    fresh.push(key);
  }
  return fresh;
}
