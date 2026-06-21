// @vitest-environment node
import {
  createAccount,
  createWalletState,
  type RawWalletV1,
  type StorageAdapter,
} from "conceal-wallet-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { coinbaseTxsFor } from "./test-helpers";

/**
 * Smooth wallet switching (feat/smooth-wallet-switch): the runtime caches every
 * UNLOCKED wallet keyed by id, so switching to an already-unlocked wallet is instant
 * and `lock()` drops ALL cached keys. These tests pin the two safety-critical
 * properties:
 *   (1) cross-wallet persist isolation — a sync started for wallet A persists into A's
 *       storage even after the active wallet is switched to B mid-flight, and NEVER
 *       writes into B's storage;
 *   (2) lock() clears EVERY cached runtime (no decrypted keys survive a lock);
 *   (3) switching to a cached wallet keeps it unlocked (hasUnlockedRuntime stays true).
 *
 * Runs in the `node` environment (like the other real-sdk crypto tests).
 */

type DaemonStub = {
  nodeUrl: string;
  getHeight: () => Promise<number>;
  getNodeFeeAddress: () => Promise<string>;
  sendRawTransaction: (hex: string) => Promise<{ status: string }>;
  getRandomOuts: () => Promise<never[]>;
  getWalletSyncData: (start: number, end: number) => Promise<unknown[]>;
};

function rawFor(): RawWalletV1 {
  return {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    nonce: "",
    options: {},
  };
}

/** A StorageAdapter that records every setItem (key + count) for isolation assertions. */
function spyStorage(): StorageAdapter & { writes: string[]; setItemCount: number } {
  const store = new Map<string, string>();
  const adapter = {
    writes: [] as string[],
    setItemCount: 0,
    getItem: (key: string) => Promise.resolve(store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      adapter.writes.push(key);
      adapter.setItemCount += 1;
      store.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
    keys: () => Promise.resolve([...store.keys()]),
  };
  return adapter;
}

async function reset() {
  const runtime = await import("@/lib/services/real-sdk/runtime");
  runtime._setRuntimeForTest(null);
}

beforeEach(reset);
afterEach(reset);

describe("smooth-switch runtime — cross-wallet persist isolation", () => {
  it("a sync started for A persists into A's storage after switching active to B, never into B", async () => {
    const runtime = await import("@/lib/services/real-sdk/runtime");

    const accountA = createAccount("english");
    const accountB = createAccount("english");
    const networkHeight = 30;

    // A's daemon: a SLOW sync we can let resolve AFTER switching the active wallet.
    // The Promise executor runs synchronously, so `releaseScan` is set before use.
    let releaseScan!: () => void;
    const scanGate = new Promise<void>((resolve) => {
      releaseScan = resolve;
    });
    const daemonA: DaemonStub = {
      nodeUrl: "https://node-a.test/",
      getHeight: () => Promise.resolve(networkHeight),
      getNodeFeeAddress: () => Promise.resolve(""),
      sendRawTransaction: () => Promise.resolve({ status: "OK" }),
      getRandomOuts: () => Promise.resolve([]),
      getWalletSyncData: async (start: number, end: number) => {
        // Hold the scan open until the test releases it (after the active switch).
        await scanGate;
        return coinbaseTxsFor(start, end);
      },
    };

    const storageA = spyStorage();
    const storageB = spyStorage();

    // Install A as the active, cached runtime — scanned just below the tip so syncOnce
    // does one real scan batch and then persists (state advances).
    runtime._setRuntimeForTest({
      id: "default",
      account: accountA,
      raw: rawFor(),
      state: { ...createWalletState(accountA), scannedHeight: networkHeight - 1 },
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
      daemon: daemonA as any,
      password: "pw-a",
      viewOnly: false,
      storage: storageA,
    });
    const rtA = runtime.getRuntime();
    if (!rtA) throw new Error("expected runtime A to be installed");

    // Also cache a B runtime (idle) and remember its storage, so we can prove A's
    // write never lands there.
    const rtB = {
      id: "wallet-b",
      account: accountB,
      raw: rawFor(),
      state: { ...createWalletState(accountB), scannedHeight: networkHeight },
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
      daemon: daemonA as any,
      password: "pw-b",
      viewOnly: false,
      storage: storageB,
    };

    // Start A's sync (bound to rtA), then switch the ACTIVE wallet to B mid-flight.
    const syncPromise = runtime.syncRuntime(rtA);
    // Install B into the cache + make it active (simulating a switch to a cached wallet).
    // biome-ignore lint/suspicious/noExplicitAny: minimal runtime stub for the test
    runtime._setRuntimeForTest(rtB as any);
    expect(runtime.getRuntime()?.account.address).toBe(accountB.address);

    // Let A's scan finish and persist.
    releaseScan();
    await syncPromise;

    // A's storage received the write; B's storage did NOT.
    expect(storageA.setItemCount).toBeGreaterThanOrEqual(1);
    expect(storageA.writes).toContain("wallet");
    expect(storageB.setItemCount).toBe(0);
  });
});

describe("smooth-switch runtime — lock clears all cached runtimes", () => {
  it("lock() drops every cached wallet's keys + active id", async () => {
    const runtime = await import("@/lib/services/real-sdk/runtime");
    const accountA = createAccount("english");
    const accountB = createAccount("english");

    // Install A as active.
    runtime._setRuntimeForTest({
      id: "default",
      account: accountA,
      raw: rawFor(),
      state: createWalletState(accountA),
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
      daemon: { nodeUrl: "" } as any,
      password: "pw-a",
      viewOnly: false,
      storage: spyStorage(),
    });
    expect(runtime.isUnlocked()).toBe(true);
    expect(runtime.hasUnlockedRuntime("default")).toBe(true);

    // Cache a SECOND wallet directly into the map (then re-assert via getRuntime).
    // _setRuntimeForTest replaces the active, so to keep BOTH cached we install B and
    // then re-install A as active — both remain in the map.
    runtime._setRuntimeForTest({
      id: "wallet-b",
      account: accountB,
      raw: rawFor(),
      state: createWalletState(accountB),
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
      daemon: { nodeUrl: "" } as any,
      password: "pw-b",
      viewOnly: false,
      storage: spyStorage(),
    });
    expect(runtime.hasUnlockedRuntime("wallet-b")).toBe(true);

    runtime.lock();

    // No cached keys survive — for ANY wallet — and there's no active runtime.
    expect(runtime.isUnlocked()).toBe(false);
    expect(runtime.getRuntime()).toBeNull();
    expect(runtime.hasUnlockedRuntime("default")).toBe(false);
    expect(runtime.hasUnlockedRuntime("wallet-b")).toBe(false);
  });

  it("disconnect() also clears the cache (auto-lock path)", async () => {
    const runtime = await import("@/lib/services/real-sdk/runtime");
    const account = createAccount("english");
    runtime._setRuntimeForTest({
      id: "default",
      account,
      raw: rawFor(),
      state: createWalletState(account),
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
      daemon: { nodeUrl: "" } as any,
      password: "pw",
      viewOnly: false,
      storage: spyStorage(),
    });
    expect(runtime.isUnlocked()).toBe(true);
    await runtime.disconnect();
    expect(runtime.isUnlocked()).toBe(false);
    expect(runtime.getRuntime()).toBeNull();
  });
});

describe("smooth-switch runtime — switching to a cached wallet stays unlocked", () => {
  it("switchActiveWallet to a cached id keeps it unlocked and active", async () => {
    const index = await import("@/lib/services/real-sdk/wallets-index");
    const storage = await import("@/lib/services/real-sdk/storage");
    const runtime = await import("@/lib/services/real-sdk/runtime");

    // Clean slate for the registry (this case touches the real index, not just the cache).
    await index._clearWalletsIndex();
    const raw = storage.getSdkWalletStorage();
    for (const key of await raw.keys()) await raw.removeItem(key);
    storage._resetSdkWalletStorage();

    // Adopt two real wallets — A (default) then B (namespaced + active), both cached.
    const accountA = createAccount("english");
    await runtime.adopt({
      raw: rawFor(),
      keys: {
        pub: { spend: accountA.keys.spend.pub, view: accountA.keys.view.pub },
        priv: { spend: accountA.keys.spend.sec, view: accountA.keys.view.sec },
      },
      password: "pw-a",
    });
    const accountB = createAccount("english");
    await runtime.adopt({
      raw: rawFor(),
      keys: {
        pub: { spend: accountB.keys.spend.pub, view: accountB.keys.view.pub },
        priv: { spend: accountB.keys.spend.sec, view: accountB.keys.view.sec },
      },
      password: "pw-b",
      label: "Second",
    });

    const metas = await runtime.listWalletMetas();
    const aId = metas.find((m) => m.address === accountA.address)?.id;
    const bId = metas.find((m) => m.address === accountB.address)?.id;
    if (!aId || !bId) throw new Error("expected both wallets registered");

    // Both are cached from adopt; B is currently active. Switch to A — instant, cached.
    expect(runtime.hasUnlockedRuntime(aId)).toBe(true);
    expect(runtime.hasUnlockedRuntime(bId)).toBe(true);

    await runtime.switchActiveWallet(aId);
    expect(runtime.getRuntime()?.account.address).toBe(accountA.address);
    expect(runtime.hasUnlockedRuntime(aId)).toBe(true);
    // B stays cached too (no lock on switch) — switching back is also instant.
    expect(runtime.hasUnlockedRuntime(bId)).toBe(true);

    await runtime.switchActiveWallet(bId);
    expect(runtime.getRuntime()?.account.address).toBe(accountB.address);

    // Cleanup the registry + cache for the next suite.
    runtime.lock();
    await index._clearWalletsIndex();
  });
});

describe("smooth-switch service contract — switchWallet returns WalletInfo for cached, null for uncached", () => {
  it("real-sdk: cached wallet → WalletInfo (instant); uncached wallet → null (needs unlock)", async () => {
    const index = await import("@/lib/services/real-sdk/wallets-index");
    const storage = await import("@/lib/services/real-sdk/storage");
    const runtime = await import("@/lib/services/real-sdk/runtime");
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");

    // Clean registry + storage.
    runtime._setRuntimeForTest(null);
    await index._clearWalletsIndex();
    const raw = storage.getSdkWalletStorage();
    for (const key of await raw.keys()) await raw.removeItem(key);
    storage._resetSdkWalletStorage();

    // Register two wallets in the index WITHOUT caching their runtimes.
    const accountA = createAccount("english");
    const accountB = createAccount("english");
    const metaA = await index.registerWallet({ label: "Main wallet", address: accountA.address });
    const metaB = await index.registerWallet({ label: "Second", address: accountB.address });

    // Cache ONLY A (with a daemon stub so getHeight resolves without a network call).
    runtime._setRuntimeForTest({
      id: metaA.id,
      account: accountA,
      raw: rawFor(),
      state: { ...createWalletState(accountA), scannedHeight: 100 },
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
      daemon: { nodeUrl: "https://node.test/", getHeight: () => Promise.resolve(123) } as any,
      password: "pw-a",
      viewOnly: false,
      storage: spyStorage(),
    });

    // Switch to A (cached) → instant WalletInfo, no null.
    const infoA = await realSdkWalletService.switchWallet(metaA.id);
    expect(infoA).not.toBeNull();
    expect(infoA?.address).toBe(accountA.address);
    expect(infoA?.networkHeight).toBe(123);

    // Switch to B (registered but NOT cached) → null (caller must unlock in place).
    const infoB = await realSdkWalletService.switchWallet(metaB.id);
    expect(infoB).toBeNull();
    // The registry's active id moved to B even though no runtime exists yet.
    expect(await runtime.activeWalletId()).toBe(metaB.id);

    // Cleanup.
    runtime._setRuntimeForTest(null);
    await index._clearWalletsIndex();
  });

  it("mock: switchWallet always returns WalletInfo (session stays open)", async () => {
    const { _resetMockWallets, mockWalletService } = await import(
      "@/lib/services/mock/wallet.service"
    );
    _resetMockWallets();
    const wallets = await mockWalletService.listWallets();
    const target = wallets.find((w) => !w.isActive);
    if (!target) throw new Error("expected an inactive mock wallet");

    const info = await mockWalletService.switchWallet(target.id);
    expect(info).not.toBeNull();
    expect(typeof info?.address).toBe("string");
    // And the active wallet actually moved.
    const after = await mockWalletService.listWallets();
    expect(after.find((w) => w.id === target.id)?.isActive).toBe(true);
  });
});
