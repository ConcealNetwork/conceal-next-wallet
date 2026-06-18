// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `ensureSdkReady` gates the SDK's async WASM init (browser) and no-ops in Node.
 * These tests verify it resolves and is memoized (init runs at most once), without
 * coupling to the SDK's own internal init memoization.
 */

describe("ensureSdkReady", () => {
  afterEach(async () => {
    const { _resetSdkReady } = await import("@/lib/services/real-sdk/ready");
    _resetSdkReady();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("resolves (node no-op / awaited init)", async () => {
    const { ensureSdkReady } = await import("@/lib/services/real-sdk/ready");
    await expect(ensureSdkReady()).resolves.toBeUndefined();
  });

  it("is memoized — repeated calls return the same settled promise (init runs once)", async () => {
    const { ensureSdkReady } = await import("@/lib/services/real-sdk/ready");
    const first = ensureSdkReady();
    const second = ensureSdkReady();
    // Same promise reference proves init() was invoked at most once.
    expect(second).toBe(first);
    await expect(first).resolves.toBeUndefined();
    // A third call after settling still returns the cached promise (no re-init).
    const third = ensureSdkReady();
    expect(third).toBe(first);
    await expect(third).resolves.toBeUndefined();
  });

  it("calls the SDK init exactly once across concurrent + sequential calls", async () => {
    // ESM namespaces aren't spyable, so mock the SDK module with a counting `init`
    // (everything else passed through via importActual). Scoped with doMock +
    // resetModules so a fresh `ready.ts` binds to this mock.
    let initCalls = 0;
    vi.resetModules();
    vi.doMock("conceal-wallet-sdk", async () => {
      const actual =
        await vi.importActual<typeof import("conceal-wallet-sdk")>("conceal-wallet-sdk");
      return {
        ...actual,
        init: () => {
          initCalls += 1;
          return Promise.resolve();
        },
      };
    });

    const { ensureSdkReady } = await import("@/lib/services/real-sdk/ready");
    await Promise.all([ensureSdkReady(), ensureSdkReady(), ensureSdkReady()]);
    await ensureSdkReady();

    expect(initCalls).toBe(1);
    vi.doUnmock("conceal-wallet-sdk");
  });
});
