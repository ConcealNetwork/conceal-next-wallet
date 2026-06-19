import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _resetSdkWalletStorage, getSdkWalletStorage } from "@/lib/services/real-sdk/storage";
import {
  DEFAULT_WALLET_ID,
  getActiveWallet,
  readWalletsIndex,
  registerWallet,
  setActiveWallet,
  storageForWallet,
  unregisterWallet,
  updateWallet,
} from "@/lib/services/real-sdk/wallets-index";

/**
 * Multi-wallet registry (#95): migration of a legacy bare blob, default-vs-namespaced
 * keyspaces + isolation, register/switch/rename/unregister. jsdom has no IndexedDB, so
 * the storage adapter uses its localStorage fallback.
 */

beforeEach(() => {
  _resetSdkWalletStorage();
  window.localStorage.clear();
});
afterEach(() => {
  _resetSdkWalletStorage();
  window.localStorage.clear();
});

describe("wallets-index (#95)", () => {
  it("returns an empty registry when nothing is stored", async () => {
    expect((await readWalletsIndex()).wallets).toHaveLength(0);
  });

  it("migrates an existing bare 'wallet' blob into a default entry", async () => {
    await getSdkWalletStorage().setItem("wallet", '{"data":[1,2],"nonce":"n"}');
    const index = await readWalletsIndex();
    expect(index.wallets).toHaveLength(1);
    expect(index.wallets[0]?.id).toBe(DEFAULT_WALLET_ID);
    expect(index.wallets[0]?.namespace).toBe("");
    expect(index.activeId).toBe(DEFAULT_WALLET_ID);
  });

  it("registers the first wallet at the bare key and the second namespaced + active", async () => {
    const first = await registerWallet({ label: "Main" });
    expect(first.id).toBe(DEFAULT_WALLET_ID);
    expect(first.namespace).toBe("");

    const second = await registerWallet({ label: "Savings" });
    expect(second.id).not.toBe(DEFAULT_WALLET_ID);
    expect(second.namespace).toBe(second.id);

    const index = await readWalletsIndex();
    expect(index.wallets).toHaveLength(2);
    expect(index.activeId).toBe(second.id);
  });

  it("isolates each wallet's keyspace", async () => {
    const a = await registerWallet({ label: "A" }); // default → bare "wallet"
    const b = await registerWallet({ label: "B" }); // namespaced
    await storageForWallet(a).setItem("wallet", "AAA");
    await storageForWallet(b).setItem("wallet", "BBB");

    expect(await storageForWallet(a).getItem("wallet")).toBe("AAA");
    expect(await storageForWallet(b).getItem("wallet")).toBe("BBB");
    // The bare key holds the default wallet; B's lives under its namespace.
    expect(await getSdkWalletStorage().getItem("wallet")).toBe("AAA");
  });

  it("switches active, renames, and caches the address", async () => {
    const a = await registerWallet({ label: "A" });
    await registerWallet({ label: "B" });
    await setActiveWallet(a.id);
    expect((await getActiveWallet())?.id).toBe(a.id);

    await updateWallet(a.id, { label: "Alpha", address: "ccx7AAA" });
    const meta = (await readWalletsIndex()).wallets.find((w) => w.id === a.id);
    expect(meta?.label).toBe("Alpha");
    expect(meta?.address).toBe("ccx7AAA");
  });

  it("unregistering the DEFAULT wallet erases only its blob, never other wallets or the index", async () => {
    // Regression: the default wallet's storage is the RAW adapter, whose keys() lists
    // the registry + every namespaced wallet — iterating it would wipe everything.
    const def = await registerWallet({ label: "Default" }); // bare "wallet"
    const other = await registerWallet({ label: "Other" }); // namespaced
    await storageForWallet(def).setItem("wallet", "DEFAULT-BLOB");
    await storageForWallet(other).setItem("wallet", "OTHER-BLOB");

    const newActive = await unregisterWallet(def.id);

    expect(await storageForWallet(def).getItem("wallet")).toBeNull(); // default erased
    expect(await storageForWallet(other).getItem("wallet")).toBe("OTHER-BLOB"); // survives
    const index = await readWalletsIndex();
    expect(index.wallets.map((w) => w.id)).toEqual([other.id]); // registry intact
    expect(newActive).toBe(other.id);
  });

  it("unregister erases the wallet's storage and reassigns active", async () => {
    const a = await registerWallet({ label: "A" });
    const b = await registerWallet({ label: "B" }); // active
    await storageForWallet(b).setItem("wallet", "BBB");

    const newActive = await unregisterWallet(b.id);
    expect(newActive).toBe(a.id);
    expect((await readWalletsIndex()).wallets).toHaveLength(1);
    expect(await storageForWallet(b).getItem("wallet")).toBeNull();
  });
});
