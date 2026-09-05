import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Browser hide-flush: pagehide / visibility hidden must persist in-memory
 * deep-sync progress before the tab is discarded. Mock mode stays a no-op
 * so the hook never pulls the engine.
 */

const flushSyncCheckpoint = vi.fn<() => Promise<void>>();

vi.mock("@/lib/env", () => ({ env: { useMockWallet: false } }));
vi.mock("@/lib/services", () => ({
  services: { wallet: { flushSyncCheckpoint: () => flushSyncCheckpoint() } },
}));

import { useSyncCheckpoint } from "@/lib/hooks/use-sync-checkpoint";

describe("useSyncCheckpoint", () => {
  beforeEach(() => {
    flushSyncCheckpoint.mockReset();
    flushSyncCheckpoint.mockResolvedValue(undefined);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });
  afterEach(() => {
    cleanup();
  });

  it("flushes on pagehide", async () => {
    renderHook(() => useSyncCheckpoint());
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(flushSyncCheckpoint).toHaveBeenCalledOnce();
  });

  it("flushes when the tab becomes hidden", async () => {
    renderHook(() => useSyncCheckpoint());
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(flushSyncCheckpoint).toHaveBeenCalledOnce();
  });

  it("does not flush when the tab becomes visible", async () => {
    renderHook(() => useSyncCheckpoint());
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(flushSyncCheckpoint).not.toHaveBeenCalled();
  });

  it("stops listening after unmount", async () => {
    const { unmount } = renderHook(() => useSyncCheckpoint());
    unmount();
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(flushSyncCheckpoint).not.toHaveBeenCalled();
  });
});
