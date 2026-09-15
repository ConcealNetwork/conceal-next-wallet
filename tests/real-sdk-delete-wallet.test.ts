// @vitest-environment node
import { createAccount, createWalletState, type RawWalletV1 } from "conceal-wallet-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { coinbaseTxsFor } from "./test-helpers";

/**
 * Delete must beat an in-flight sync: drop the cached runtime, settle any persist
 * that already started, erase the keyspace, and refuse later persistRuntime writes
 * even if syncRuntime still holds the old object.
 */

type Account = ReturnType<typeof createAccount>;

function userKeysOf(account: Account) {
  return {
    pub: { spend: account.keys.spend.pub, view: account.keys.view.pub },
    priv: { spend: account.keys.spend.sec, view: account.keys.view.sec },
  };
}

function rawFor(account: Account): RawWalletV1 {
  return {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    nonce: "",
    keys: userKeysOf(account),
    creationHeight: 0,
    options: {},
  };
}

function hangDaemon(height: number, gate: Promise<void>, onEnter: () => void) {
  return {
    nodeUrl: "https://node.test/",
    getHeight: () => Promise.resolve(height),
    getNodeFeeAddress: () => Promise.resolve(""),
    sendRawTransaction: () => Promise.resolve({ status: "OK" }),
    getRandomOuts: () => Promise.resolve([]),
    getWalletSyncData: async (start: number, end: number) => {
      onEnter();
      await gate;
      return coinbaseTxsFor(start, end);
    },
    getTransactionsPool: async () => {
      await gate;
      return [];
    },
  };
}

async function reset() {
  const storage = await import("@/lib/services/real-sdk/storage");
  const index = await import("@/lib/services/real-sdk/wallets-index");
  const runtime = await import("@/lib/services/real-sdk/runtime");
  runtime.lock();
  await index._clearWalletsIndex();
  const raw = storage.getSdkWalletStorage();
  for (const key of await raw.keys()) await raw.removeItem(key);
  storage._resetSdkWalletStorage();
}

beforeEach(reset);
afterEach(reset);

describe("real-sdk delete — persist fence", () => {
  it("persistRuntime is a no-op after lock drops the cached runtime", async () => {
    const runtime = await import("@/lib/services/real-sdk/runtime");
    const account = createAccount("english");
    const writes: string[] = [];
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => Promise.resolve(store.get(key) ?? null),
      setItem: (key: string, value: string) => {
        writes.push(key);
        store.set(key, value);
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        store.delete(key);
        return Promise.resolve();
      },
      keys: () => Promise.resolve([...store.keys()]),
    };

    runtime._setRuntimeForTest({
      id: "default",
      account,
      raw: rawFor(account),
      state: createWalletState(account),
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub
      daemon: { nodeUrl: "" } as any,
      password: "pw",
      viewOnly: false,
      storage,
    });
    const rt = runtime.getRuntime();
    if (!rt) throw new Error("expected runtime");

    await runtime.persistRuntime(rt);
    expect(writes).toContain("wallet");
    const countAfterLive = writes.length;

    runtime.lock();
    await runtime.persistRuntime(rt);
    expect(writes.length).toBe(countAfterLive);
  });
});

describe("real-sdk delete — removeWalletById vs in-flight sync", () => {
  it("deleting the last unlocked wallet mid-sync leaves no envelope and no registry recovery", async () => {
    const runtime = await import("@/lib/services/real-sdk/runtime");
    const index = await import("@/lib/services/real-sdk/wallets-index");
    const storage = await import("@/lib/services/real-sdk/storage");

    const account = createAccount("english");
    await runtime.adopt({ raw: rawFor(account), keys: userKeysOf(account), password: "pw-a" });
    const rt = runtime.getRuntime();
    if (!rt) throw new Error("expected adopted runtime");

    const raw = storage.getSdkWalletStorage();
    expect(await raw.getItem("wallet")).not.toBeNull();

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const enteredScan = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const height = 30;
    rt.state = { ...rt.state, scannedHeight: height - 1 };
    // biome-ignore lint/suspicious/noExplicitAny: hang the scan until delete finishes
    rt.daemon = hangDaemon(height, gate, entered) as any;

    const syncPromise = runtime.syncRuntime(rt);
    await enteredScan;
    await runtime.removeWalletById(index.DEFAULT_WALLET_ID);

    expect(runtime.hasUnlockedRuntime(index.DEFAULT_WALLET_ID)).toBe(false);
    expect(await raw.getItem("wallet")).toBeNull();
    expect((await index.readWalletsIndex()).wallets).toHaveLength(0);

    release();
    await syncPromise;
    await runtime.persistRuntime(rt);

    expect(await raw.getItem("wallet")).toBeNull();
    // Empty index re-derives from envelopes — a resurrected blob would reappear here.
    expect((await index.readWalletsIndex()).wallets).toHaveLength(0);
  });

  it("deleting a namespaced wallet mid-sync erases only that keyspace", async () => {
    const runtime = await import("@/lib/services/real-sdk/runtime");
    const index = await import("@/lib/services/real-sdk/wallets-index");

    const a = createAccount("english");
    await runtime.adopt({ raw: rawFor(a), keys: userKeysOf(a), password: "pw-a" });
    const b = createAccount("english");
    await runtime.adopt({
      raw: rawFor(b),
      keys: userKeysOf(b),
      password: "pw-b",
      label: "Second",
    });

    const metas = await runtime.listWalletMetas();
    const defaultMeta = metas.find((m) => m.id === index.DEFAULT_WALLET_ID);
    const secondMeta = metas.find((m) => m.id !== index.DEFAULT_WALLET_ID);
    if (!defaultMeta || !secondMeta) throw new Error("expected two wallets");

    const rtB = runtime.getRuntime();
    if (!rtB || rtB.id !== secondMeta.id) throw new Error("expected B active");

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const enteredScan = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const height = 30;
    rtB.state = { ...rtB.state, scannedHeight: height - 1 };
    // biome-ignore lint/suspicious/noExplicitAny: hang the scan until delete finishes
    rtB.daemon = hangDaemon(height, gate, entered) as any;

    const syncPromise = runtime.syncRuntime(rtB);
    await enteredScan;
    await runtime.removeWalletById(secondMeta.id);
    release();
    await syncPromise;
    await runtime.persistRuntime(rtB);

    expect(await index.storageForWallet(secondMeta).getItem("wallet")).toBeNull();
    expect(await index.storageForWallet(defaultMeta).getItem("wallet")).not.toBeNull();
    const left = (await runtime.listWalletMetas()).map((m) => m.id);
    expect(left).toEqual([index.DEFAULT_WALLET_ID]);
  });

  it("a stale runtime persist cannot overwrite a newly adopted default wallet", async () => {
    const runtime = await import("@/lib/services/real-sdk/runtime");
    const index = await import("@/lib/services/real-sdk/wallets-index");
    const storage = await import("@/lib/services/real-sdk/storage");

    const a = createAccount("english");
    await runtime.adopt({ raw: rawFor(a), keys: userKeysOf(a), password: "pw-a" });
    const oldRt = runtime.getRuntime();
    if (!oldRt) throw new Error("expected first runtime");

    await runtime.removeWalletById(index.DEFAULT_WALLET_ID);

    const b = createAccount("english");
    await runtime.adopt({ raw: rawFor(b), keys: userKeysOf(b), password: "pw-b" });
    const raw = storage.getSdkWalletStorage();
    const blobB = await raw.getItem("wallet");
    expect(blobB).not.toBeNull();

    await runtime.persistRuntime(oldRt);
    expect(await raw.getItem("wallet")).toBe(blobB);

    const { openStoredWallet } = await import("conceal-wallet-sdk");
    const opened = await openStoredWallet(raw, "pw-b");
    expect(opened).not.toBeNull();
    expect(opened?.keys.pub.spend).toBe(b.keys.spend.pub);
  });
});
