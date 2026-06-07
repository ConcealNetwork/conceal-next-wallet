import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIdleLock } from "@/lib/hooks/use-idle-lock";

describe("useIdleLock", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls onLock after the timeout elapses with no activity", () => {
    const onLock = vi.fn();
    renderHook(() => useIdleLock(1000, onLock));
    expect(onLock).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it("resets the countdown on user activity", () => {
    const onLock = vi.fn();
    renderHook(() => useIdleLock(1000, onLock));
    act(() => vi.advanceTimersByTime(800));
    act(() => window.dispatchEvent(new Event("keydown")));
    act(() => vi.advanceTimersByTime(800)); // 800ms since the reset — still under 1000
    expect(onLock).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200)); // now 1000ms since the reset
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it("is disabled when the timeout is 0 or negative", () => {
    const onLock = vi.fn();
    renderHook(() => useIdleLock(0, onLock));
    act(() => vi.advanceTimersByTime(10 * 60 * 1000));
    expect(onLock).not.toHaveBeenCalled();
  });

  it("stops listening after unmount", () => {
    const onLock = vi.fn();
    const { unmount } = renderHook(() => useIdleLock(1000, onLock));
    unmount();
    act(() => vi.advanceTimersByTime(5000));
    expect(onLock).not.toHaveBeenCalled();
  });

  it("locks on return-to-visible when the deadline elapsed while hidden", () => {
    const onLock = vi.fn();
    renderHook(() => useIdleLock(1000, onLock));
    // Simulate a throttled background tab: advance the wall clock (not the timer
    // queue), then fire the visibility change as the tab returns to the front.
    vi.setSystemTime(Date.now() + 5000);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(onLock).toHaveBeenCalledTimes(1);
  });
});
