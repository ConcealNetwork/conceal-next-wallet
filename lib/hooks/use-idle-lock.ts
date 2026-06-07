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
 * `onLock` is held in a ref so passing a fresh callback each render doesn't
 * re-subscribe the listeners or restart the countdown.
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
    const reset = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => onLockRef.current(), timeoutMs);
    };

    reset();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, reset, { passive: true });
    }

    return () => {
      if (timer !== undefined) clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, reset);
      }
    };
  }, [timeoutMs]);
}
