import type { WatchedContact } from "@/lib/ui/check-ins";

/**
 * Device-local persistence for check-in watchers. Pure UI metadata — no
 * `wallet-core` import, no service-spine involvement; `localStorage`-guarded for
 * SSR / static-export safety. Mirrors the scheduled-payments store.
 */

const STORAGE_KEY = "ccx-check-in-watchers";

function isWatchedContact(value: unknown): value is WatchedContact {
  const w = value as Partial<WatchedContact>;
  return (
    typeof w === "object" &&
    w !== null &&
    typeof w.id === "string" &&
    typeof w.address === "string" &&
    typeof w.label === "string" &&
    typeof w.intervalDays === "number" &&
    Number.isFinite(w.intervalDays) &&
    typeof w.graceDays === "number" &&
    Number.isFinite(w.graceDays) &&
    (w.paymentId === undefined || typeof w.paymentId === "string")
  );
}

export function listWatchers(): WatchedContact[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isWatchedContact) : [];
  } catch {
    return [];
  }
}

function persist(watchers: WatchedContact[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(watchers));
}

/** Insert or update by id. */
export function saveWatcher(watcher: WatchedContact): WatchedContact[] {
  const next = listWatchers().filter((w) => w.id !== watcher.id);
  next.push(watcher);
  persist(next);
  return next;
}

export function removeWatcher(id: string): WatchedContact[] {
  const next = listWatchers().filter((w) => w.id !== id);
  persist(next);
  return next;
}

/** Patch a single watcher (pause/snooze toggles). */
export function updateWatcher(id: string, patch: Partial<WatchedContact>): WatchedContact[] {
  const next = listWatchers().map((w) => (w.id === id ? { ...w, ...patch, id: w.id } : w));
  persist(next);
  return next;
}
