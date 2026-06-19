// @vitest-environment node
import { createAccount, type RawWalletV1, type UserKeys } from "conceal-wallet-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Multi-wallet runtime wiring (#95): `adopt` registers each new wallet (first →
 * bare/default, rest → namespaced + active) and persists into THAT wallet's
 * keyspace, so two wallets' encrypted blobs never collide. Also covers the runtime
 * switcher helpers (`listWalletMetas`, `activeWalletId`, `switchActiveWallet`).
 *
 * Runs in the `node` environment (like the other real-sdk crypto tests): the SDK
 * storage adapter falls back to its in-memory implementation when no IndexedDB /
 * localStorage global exists, which is exactly what we want for isolation testing.
 */

type Account = ReturnType<typeof createAccount>;

/** The normalized {@link UserKeys} shape the runtime expects (sec/pub split). */
function userKeysOf(account: Account): UserKeys {
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

async function reset() {
  const storage = await import("@/lib/services/real-sdk/storage");
  const index = await import("@/lib/services/real-sdk/wallets-index");
  const runtime = await import("@/lib/services/real-sdk/runtime");
  runtime.lock();
  await index._clearWalletsIndex();
  // Wipe the shared in-memory adapter so each case starts empty.
  const raw = storage.getSdkWalletStorage();
  for (const key of await raw.keys()) await raw.removeItem(key);
  storage._resetSdkWalletStorage();
}

beforeEach(reset);
afterEach(reset);

describe("real-sdk runtime — multi-wallet (#95)", () => {
  it("adopt registers the first wallet at the default id and the second namespaced + active", async () => {
    const runtime = await import("@/lib/services/real-sdk/runtime");
    const index = await import("@/lib/services/real-sdk/wallets-index");

    const a = createAccount("english");
    await runtime.adopt({ raw: rawFor(a), keys: userKeysOf(a), password: "pw-a" });

    let metas = await runtime.listWalletMetas();
    expect(metas).toHaveLength(1);
    expect(metas[0].id).toBe(index.DEFAULT_WALLET_ID);
    expect(metas[0].namespace).toBe("");
    expect(metas[0].label).toBe("Main wallet");
    expect(metas[0].address).toBe(a.address);

    const b = createAccount("english");
    await runtime.adopt({
      raw: rawFor(b),
      keys: userKeysOf(b),
      password: "pw-b",
      label: "Savings",
    });

    metas = await runtime.listWalletMetas();
    expect(metas).toHaveLength(2);
    const second = metas.find((m) => m.id !== index.DEFAULT_WALLET_ID);
    expect(second?.namespace).toBe(second?.id);
    expect(second?.label).toBe("Savings");
    // The newly adopted wallet is active.
    expect(await runtime.activeWalletId()).toBe(second?.id);
  });

  it("persists each wallet's encrypted blob into its own keyspace (no collision)", async () => {
    const runtime = await import("@/lib/services/real-sdk/runtime");
    const index = await import("@/lib/services/real-sdk/wallets-index");
    const storage = await import("@/lib/services/real-sdk/storage");

    const a = createAccount("english");
    await runtime.adopt({ raw: rawFor(a), keys: userKeysOf(a), password: "pw-a" });
    const b = createAccount("english");
    await runtime.adopt({ raw: rawFor(b), keys: userKeysOf(b), password: "pw-b", label: "Second" });

    const metas = await runtime.listWalletMetas();
    const defaultMeta = metas.find((m) => m.id === index.DEFAULT_WALLET_ID);
    const secondMeta = metas.find((m) => m.id !== index.DEFAULT_WALLET_ID);
    if (!defaultMeta || !secondMeta) throw new Error("expected two registered wallets");

    // The default wallet's blob lives at the bare "wallet" key; the second's under
    // its namespace — both present and DISTINCT.
    const raw = storage.getSdkWalletStorage();
    const defaultBlob = await index.storageForWallet(defaultMeta).getItem("wallet");
    const secondBlob = await index.storageForWallet(secondMeta).getItem("wallet");
    expect(defaultBlob).not.toBeNull();
    expect(secondBlob).not.toBeNull();
    expect(defaultBlob).not.toBe(secondBlob);
    // The bare key holds the default wallet (back-compat / legacy reads).
    expect(await raw.getItem("wallet")).toBe(defaultBlob);
  });

  it("unlock reopens the active wallet's keyspace (round-trips both wallets' keys)", async () => {
    const runtime = await import("@/lib/services/real-sdk/runtime");

    const a = createAccount("english");
    await runtime.adopt({ raw: rawFor(a), keys: userKeysOf(a), password: "pw-a" });
    const b = createAccount("english");
    await runtime.adopt({ raw: rawFor(b), keys: userKeysOf(b), password: "pw-b", label: "Second" });

    // Active is B (last adopted). Lock, then unlock → B's account.
    runtime.lock();
    const openedB = await runtime.unlock("pw-b");
    expect(openedB.account.address).toBe(b.address);

    // Switch to A (NOT cached after lock), then unlock with A's password → A's account.
    const metas = await runtime.listWalletMetas();
    const aId = metas.find((m) => m.address === a.address)?.id;
    if (!aId) throw new Error("expected wallet A to be registered");
    await runtime.switchActiveWallet(aId);
    const openedA = await runtime.unlock("pw-a");
    expect(openedA.account.address).toBe(a.address);

    // B's password must NOT open A's keyspace (wrong wallet) — keyspace isolation holds.
    // Smooth-switching caches unlocked wallets, so we must LOCK first (drop A's cached
    // runtime); otherwise unlock returns the already-cached A instantly (by design).
    runtime.lock();
    await runtime.switchActiveWallet(aId);
    await expect(runtime.unlock("pw-b")).rejects.toThrow();
  });
});
