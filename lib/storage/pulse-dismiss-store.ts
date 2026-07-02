const STORAGE_KEY = "ccx-pulse-dismissed";

export const PULSE_DISMISS_RESET = "ccx-pulse-dismiss-reset";

export function listDismissed(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

export function dismissPulse(messageId: string): Set<string> {
  const next = listDismissed();
  next.add(messageId);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  }
  return next;
}

/** Cleared on wallet re-scan so rebuilt pulses (same tx hash) show again. */
export function resetPulseDismissed(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PULSE_DISMISS_RESET));
  }
}
