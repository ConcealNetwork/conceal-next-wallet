import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSyncWakeLock } from "@/lib/hooks/use-sync-wake-lock";

type FakeSentinel = {
  release: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
};

function makeSentinel(): FakeSentinel {
  return { release: vi.fn(async () => {}), addEventListener: vi.fn() };
}

function installWakeLock(request: (type: string) => Promise<FakeSentinel>) {
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
}

describe("useSyncWakeLock", () => {
  beforeEach(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
  afterEach(() => {
    // biome-ignore lint/performance/noDelete: test cleanup of the injected global
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    vi.restoreAllMocks();
  });

  it("requests a screen wake lock while active", () => {
    const request = vi.fn(async () => makeSentinel());
    installWakeLock(request);
    renderHook(() => useSyncWakeLock(true));
    // request() is called synchronously inside the effect (before its first await).
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("screen");
  });

  it("does not request a lock when inactive", () => {
    const request = vi.fn(async () => makeSentinel());
    installWakeLock(request);
    renderHook(() => useSyncWakeLock(false));
    expect(request).not.toHaveBeenCalled();
  });

  it("releases the lock when active flips false", async () => {
    const sentinel = makeSentinel();
    installWakeLock(vi.fn(async () => sentinel));
    const { rerender } = renderHook(({ active }) => useSyncWakeLock(active), {
      initialProps: { active: true },
    });
    await act(async () => {}); // flush the in-flight request so the sentinel is stored
    await act(async () => rerender({ active: false }));
    expect(sentinel.release).toHaveBeenCalled();
  });

  it("releases the lock on unmount", async () => {
    const sentinel = makeSentinel();
    installWakeLock(vi.fn(async () => sentinel));
    const { unmount } = renderHook(() => useSyncWakeLock(true));
    await act(async () => {});
    await act(async () => unmount());
    expect(sentinel.release).toHaveBeenCalled();
  });

  it("no-ops when the Wake Lock API is unavailable", () => {
    expect(() => renderHook(() => useSyncWakeLock(true))).not.toThrow();
  });

  it("does not start a second request while one is in flight (concurrent guard)", async () => {
    let resolve!: (s: FakeSentinel) => void;
    const request = vi.fn(() => new Promise<FakeSentinel>((r) => (resolve = r)));
    installWakeLock(request as unknown as (type: string) => Promise<FakeSentinel>);
    renderHook(() => useSyncWakeLock(true)); // effect → acquire() (request pending)
    // A visibilitychange while the first request is still pending must NOT
    // kick off a second request (the `acquiring` guard) — that would leak a lock.
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => resolve(makeSentinel()));
  });
});
