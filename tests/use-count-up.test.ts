import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCountUp } from "@/lib/hooks/use-count-up";

// Drive requestAnimationFrame deterministically. The hook treats the first
// timestamp it sees as the animation's start, so each run needs a priming frame
// followed by a later frame that advances the easing clock.
describe("useCountUp", () => {
  let frame: Array<(t: number) => void>;
  const origRaf = window.requestAnimationFrame;
  const origCaf = window.cancelAnimationFrame;

  function frameAt(abs: number) {
    const due = frame;
    frame = [];
    act(() => {
      for (const cb of due) cb(abs);
    });
  }

  beforeEach(() => {
    frame = [];
    window.requestAnimationFrame = ((cb: (t: number) => void) => {
      frame.push(cb);
      return frame.length;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = (() => {}) as typeof window.cancelAnimationFrame;
  });

  afterEach(() => {
    window.requestAnimationFrame = origRaf;
    window.cancelAnimationFrame = origCaf;
  });

  it("counts up from 0 on first mount", () => {
    const { result } = renderHook(() => useCountUp(100, { durationMs: 700 }));
    expect(result.current).toBe(0);
    frameAt(0); // prime the baseline timestamp
    frameAt(700); // a full duration later -> complete
    expect(result.current).toBe(100);
  });

  it("animates from the previous value when the target changes, never snapping back to 0", () => {
    const { result, rerender } = renderHook(({ t }) => useCountUp(t, { durationMs: 700 }), {
      initialProps: { t: 100 },
    });
    frameAt(0);
    frameAt(700);
    expect(result.current).toBe(100);

    // The sync-time regression: a new target reset the display to 0 and recounted
    // the whole way on every poll. It must continue from where it already was.
    rerender({ t: 200 });
    expect(result.current).toBeGreaterThanOrEqual(100);

    frameAt(800); // prime
    frameAt(1600); // complete
    expect(result.current).toBe(200);
  });

  it("snaps straight to the target when animation is disabled", () => {
    const { result, rerender } = renderHook(({ t }) => useCountUp(t, { durationMs: 0 }), {
      initialProps: { t: 50 },
    });
    expect(result.current).toBe(50);
    rerender({ t: 75 });
    expect(result.current).toBe(75);
  });
});
