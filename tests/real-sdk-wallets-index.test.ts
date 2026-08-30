import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _resetSdkWalletStorage, getSdkWalletStorage } from "@/lib/services/real-sdk/storage";
import {
  DEFAULT_WALLET_ID,
  getActiveWallet,
  readWalletsIndex,
  registerWallet,
  setActiveWallet,
  storageForWallet,
  takeWalletsIndexRecoveryNotice,
  unregisterWallet,
  updateWallet,
  _clearWalletsIndex,
  _resetWalletsIndexRecoveryNotice,
} from "@/lib/services/real-sdk/wallets-index";

/**
 * Multi-wallet registry (#95): migration of a legacy bare blob, default-vs-namespaced
 * keyspaces + isolation, register/switch/rename/unregister. jsdom has no IndexedDB, so
 * the storage adapter uses its localStorage fallback.
 */

beforeEach(() => {
  _resetSdkWalletStorage();
  _resetWalletsIndexRecoveryNotice();
  window.localStorage.clear();
});
afterEach(() => {
  _resetSdkWalletStorage();
  _resetWalletsIndexRecoveryNotice();
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
    expect(takeWalletsIndexRecoveryNotice()).toBe(false);
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

  it("recovers namespaced wallets when the stored index record is corrupt JSON", async () => {
    const main = await registerWallet({ label: "Main" }); // bare "wallet" key
    const savings = await registerWallet({ label: "Savings" }); // namespaced
    await storageForWallet(main).setItem("wallet", "MAIN-BLOB");
    await storageForWallet(savings).setItem("wallet", "SAVINGS-BLOB");
    await getSdkWalletStorage().setItem("wallets-index", "{not valid json");

    const index = await readWalletsIndex();
    const ids = index.wallets.map((w) => w.id);
    expect(ids).toContain(DEFAULT_WALLET_ID);
    expect(ids).toContain(savings.id);
    const recovered = index.wallets.find((w) => w.id === savings.id);
    expect(recovered?.namespace).toBe(savings.id); // keyspace binding preserved
    expect(index.activeId).toBe(DEFAULT_WALLET_ID);
    expect(takeWalletsIndexRecoveryNotice()).toBe(true);
    expect(takeWalletsIndexRecoveryNotice()).toBe(false);
    // The blobs themselves were never touched — the switcher can still open them.
    expect(await storageForWallet(savings).getItem("wallet")).toBe("SAVINGS-BLOB");
    // The recovered registry is persisted: a second read returns it unchanged.
    expect((await readWalletsIndex()).wallets.map((w) => w.id).sort()).toEqual(
      [...ids].sort(),
    );
  });

  it("recovers namespaced wallets when the stored index record is an empty string", async () => {
    // A partial write can leave "" behind — that must take the recovery path too,
    // not the legacy no-index migration that would orphan every namespaced wallet.
    const main = await registerWallet({ label: "Main" });
    const savings = await registerWallet({ label: "Savings" });
    await storageForWallet(main).setItem("wallet", "MAIN-BLOB");
    await storageForWallet(savings).setItem("wallet", "SAVINGS-BLOB");
    await getSdkWalletStorage().setItem("wallets-index", "");

    const index = await readWalletsIndex();
    const ids = index.wallets.map((w) => w.id);
    expect(ids).toContain(DEFAULT_WALLET_ID);
    expect(ids).toContain(savings.id);
  });

  it("recovers namespaced wallets when the stored index record has no usable entries", async () => {
    const savings = await registerWallet({ label: "Savings" }); // first → default keyspace
    const holiday = await registerWallet({ label: "Holiday" }); // namespaced
    await storageForWallet(savings).setItem("wallet", "SAVINGS-BLOB");
    await storageForWallet(holiday).setItem("wallet", "HOLIDAY-BLOB");
    // A structurally-valid but wallet-less record (e.g. written by a partial write).
    await getSdkWalletStorage().setItem(
      "wallets-index",
      JSON.stringify({ activeId: DEFAULT_WALLET_ID, wallets: [] }),
    );

    const index = await readWalletsIndex();
    const ids = index.wallets.map((w) => w.id);
    expect(ids).toContain(DEFAULT_WALLET_ID);
    expect(ids).toContain(holiday.id);
    expect(index.activeId).toBe(DEFAULT_WALLET_ID);
  });

  it("recovers a namespaced-only registry with the first wallet active when the index is corrupt", async () => {
    // First wallet takes the DEFAULT keyspace; delete it, leaving only namespaced ones.
    const def = await registerWallet({ label: "Default" });
    const other = await registerWallet({ label: "Other" });
    await storageForWallet(other).setItem("wallet", "OTHER-BLOB");
    await unregisterWallet(def.id);
    await getSdkWalletStorage().setItem("wallets-index", "]]garbage[["); // + wallet-less

    const index = await readWalletsIndex();
    expect(index.wallets.map((w) => w.id)).toEqual([other.id]);
    expect(index.activeId).toBe(other.id); // default is gone → first recovered is active
  });

  it("recovers namespaced wallets when the index key is missing entirely", async () => {
    const def = await registerWallet({ label: "Default" });
    const other = await registerWallet({ label: "Other" });
    await storageForWallet(other).setItem("wallet", "OTHER-BLOB");
    await unregisterWallet(def.id);
    await _clearWalletsIndex();

    const index = await readWalletsIndex();
    expect(index.wallets.map((w) => w.id)).toEqual([other.id]);
    expect(index.activeId).toBe(other.id);
    expect(takeWalletsIndexRecoveryNotice()).toBe(true);
  });

  it("does not notify on a silent bare-wallet migration when the index key is missing", async () => {
    await getSdkWalletStorage().setItem("wallet", "LEGACY-BLOB");
    _resetWalletsIndexRecoveryNotice();

    await readWalletsIndex();
    expect(takeWalletsIndexRecoveryNotice()).toBe(false);
  });
});
