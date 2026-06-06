/**
 * Leading-edge throttle that coalesces a burst of calls into at most one
 * invocation per window, with a trailing invocation to capture the final state.
 *
 * Used to stop high-frequency wallet-sync events (the `lastHeight` setter fires
 * on every scanned block batch) from flooding the main thread with query
 * invalidations / re-renders. A continuous stream collapses to ~one call per
 * `windowMs`; the trailing call guarantees the final state is never dropped.
 */
export function createCoalescingThrottle(
  fn: () => void,
  windowMs: number,
): { trigger: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let trailing = false;

  function fire() {
    fn();
    timer = setTimeout(() => {
      timer = null;
      if (trailing) {
        trailing = false;
        fire();
      }
    }, windowMs);
  }

  return {
    trigger() {
      if (timer === null) {
        fire();
      } else {
        trailing = true;
      }
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      trailing = false;
    },
  };
}
