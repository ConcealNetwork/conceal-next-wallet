import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCoalescingThrottle } from "@/lib/hooks/coalescing-throttle";

describe("createCoalescingThrottle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires immediately on the first trigger (leading edge)", () => {
    const fn = vi.fn();
    const t = createCoalescingThrottle(fn, 500);
    t.trigger();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("coalesces a burst into one leading + one trailing call", () => {
    const fn = vi.fn();
    const t = createCoalescingThrottle(fn, 500);
    for (let i = 0; i < 100; i += 1) t.trigger();
    expect(fn).toHaveBeenCalledTimes(1); // leading only so far
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(2); // trailing flush captures the final state
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(2); // burst drained — no more
  });

  it("rate-limits a continuous stream to roughly once per window", () => {
    const fn = vi.fn();
    const t = createCoalescingThrottle(fn, 500);
    for (let i = 0; i < 40; i += 1) {
      t.trigger();
      vi.advanceTimersByTime(50); // 40 triggers over 2s
    }
    // ~once per 500ms window over 2s → far fewer than the 40 triggers
    expect(fn.mock.calls.length).toBeLessThanOrEqual(6);
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("cancel() drops a pending trailing call", () => {
    const fn = vi.fn();
    const t = createCoalescingThrottle(fn, 500);
    t.trigger(); // leading (1)
    t.trigger(); // schedules trailing
    t.cancel();
    vi.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
