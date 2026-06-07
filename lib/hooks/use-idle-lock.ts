"use client";

import { useEffect, useRef } from "react";

/** User-activity events that count as "not idle" and reset the countdown. */
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "pointerdown",
  "keydown",
  "scroll",
  "touchstart",
];

/**
 * Lock the wallet after `timeoutMs` of no user activity. Any of the activity
 * events resets the countdown. Disabled when `timeoutMs <= 0` (or not finite).
 *
 * Robust against background-tab timer throttling: we track the wall-clock time
 * of the last activity and re-check the real elapsed time whenever the tab
 * becomes visible again, locking immediately if the deadline passed while the
 * `setTimeout` was suspended. `onLock` is held in a ref so passing a fresh
 * callback each render doesn't re-subscribe or restart the countdown.
 */
export function useIdleLock(timeoutMs: number, onLock: () => void): void {
  const onLockRef = useRef(onLock);
  useEffect(() => {
    onLockRef.current = onLock;
  }, [onLock]);

  useEffect(() => {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastActivity = Date.now();

    const clear = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    // (Re)schedule based on the real time remaining since the last activity, so a
    // throttled/suspended background timer can't extend the idle window.
    const arm = () => {
      clear();
      const remaining = timeoutMs - (Date.now() - lastActivity);
      if (remaining <= 0) {
        onLockRef.current();
        return;
      }
      timer = setTimeout(() => onLockRef.current(), remaining);
    };

    const onActivity = () => {
      lastActivity = Date.now();
      arm();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        arm();
      }
    };

    arm();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clear();
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [timeoutMs]);
}
