// @vitest-environment node

// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import {
  type Account,
  COIN_UNIT_PLACES,
  createAccount,
  createWalletState,
  crypto,
  getBalance,
  type RawWalletV1,
  REMOTE_NODE_FEE_ATOMIC,
  type transactions as txns,
} from "conceal-wallet-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { coinbaseTxsFor } from "./test-helpers";

/** A fake spendable output that account `owner` genuinely owns (real key image). */
function fundOwnedOutput(owner: Account, amount: number): txns.SpendableOutput {
  const txKeys = crypto.generateKeys(crypto.randomSeed());
  const txPublicKey = txKeys.pub;
  const outputIndex = 0;
  const derivation = crypto.generateKeyDerivation(txPublicKey, owner.keys.view.sec);
  const publicKey = crypto.derivePublicKey(derivation, outputIndex, owner.keys.spend.pub);
  const ephemeralSecret = crypto.deriveSecretKey(derivation, outputIndex, owner.keys.spend.sec);
  const keyImage = crypto.generateKeyImage(publicKey, ephemeralSecret);
  return { amount, globalIndex: 1000, outputIndex, txPublicKey, publicKey, keyImage };
}

function emptyRaw(account: Account, lastHeight: number): RawWalletV1 {
  return {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight,
    nonce: "",
    keys: {
      pub: { spend: account.keys.spend.pub, view: account.keys.view.pub },
      priv: { spend: account.keys.spend.sec, view: account.keys.view.sec },
    },
    creationHeight: 0,
    options: {},
  };
}

function leftoverHex(hash: string, keyImage: string): txns.BuiltTransaction {
  return {
    hash,
    serialized: `${hash}-blob`,
    inputs: [{ keyImage }],
  } as unknown as txns.BuiltTransaction;
}

function decoyReply(amounts: number[], count: number) {
  return amounts.map((amount) => ({
    amount,
    outs: Array.from({ length: count }, (_, i) => ({
      globalIndex: 3000 + i,
      publicKey: crypto.generateKeys(crypto.randomSeed()).pub,
    })),
  }));
}

type DaemonHooks = {
  getRandomOuts?: (amounts: number[], count: number) => Promise<ReturnType<typeof decoyReply>>;
  sendRawTransaction?: (hex: string) => Promise<{ status: string }>;
  getNodeFeeAddress?: () => Promise<string>;
};

async function installFundedSender(fundAtomic: number, hooks: DaemonHooks = {}) {
  const alice = createAccount("english");
  const bob = createAccount("english");
  const aliceOutput = fundOwnedOutput(alice, fundAtomic);
  const networkHeight = 100;
  const sendRawTransaction = vi.fn(
    hooks.sendRawTransaction ?? (() => Promise.resolve({ status: "OK" })),
  );
  const getRandomOuts = vi.fn(
    hooks.getRandomOuts ??
      ((amounts: number[], count: number) => Promise.resolve(decoyReply(amounts, count))),
  );
  const getNodeFeeAddress = vi.fn(hooks.getNodeFeeAddress ?? (() => Promise.resolve("")));
  const fakeDaemon = {
    nodeUrl: "https://node.test/",
    getHeight: () => Promise.resolve(networkHeight),
    getNodeFeeAddress,
    sendRawTransaction,
    getRandomOuts,
    getWalletSyncData: (start: number, end: number) => Promise.resolve(coinbaseTxsFor(start, end)),
    getTransactionsPool: () => Promise.resolve([]),
  };
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => Promise.resolve(store.get(key) ?? null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
    keys: () => Promise.resolve([...store.keys()]),
  };
  const runtimeMod = await import("@/lib/services/real-sdk/runtime");
  runtimeMod._setRuntimeForTest({
    account: alice,
    raw: emptyRaw(alice, networkHeight),
    state: { ...createWalletState(alice), outputs: [aliceOutput], scannedHeight: networkHeight },
    // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
    daemon: fakeDaemon as any,
    password: "pw",
    viewOnly: false,
    storage,
  });
  const rt = runtimeMod.getRuntime();
  if (rt === null) throw new Error("runtime missing after install");
  return { alice, bob, rt, runtimeMod, sendRawTransaction, getRandomOuts, networkHeight };
}

afterEach(async () => {
  vi.useRealTimers();
  const { getRuntime, _setRuntimeForTest } = await import("@/lib/services/real-sdk/runtime");
  const rt = getRuntime();
  if (rt) {
    const { clearIntents } = await import("@/lib/services/real-sdk/send-intent");
    clearIntents(rt);
  }
  _setRuntimeForTest(null);
});

describe("real-sdk sendTransaction intent enqueue", () => {
  it("resolves a decoy auto intent when getRandomOuts rejects and never submits hex", async () => {
    const fundAtomic = 5_000_000;
    const sendAmount = 0.5;
    const { bob, rt, sendRawTransaction } = await installFundedSender(fundAtomic, {
      getRandomOuts: () => Promise.reject(new Error("decoys down")),
    });
    const { realSdkTransactionService } = await import(
      "@/lib/services/real-sdk/transaction.service"
    );
    const { enqueueAuto, listIntents } = await import("@/lib/services/real-sdk/send-intent");
    const { queueForRuntime } = await import("@/lib/services/real-sdk/outbound-queue");
    const { readPendingRecords } = await import("@/lib/services/real-sdk/pending-store");

    const sent = await realSdkTransactionService.sendTransaction({
      address: bob.address,
      amount: sendAmount,
    });
    expect(sent.type).toBe("send");
    expect(sent.address).toBe(bob.address);

    const sample = enqueueAuto(
      {} as typeof rt,
      { address: bob.address, amount: sendAmount },
      "decoy",
    );
    const rows = listIntents(rt);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("auto");
    expect(rows[0]?.decoyFails).toBe(sample.decoyFails);
    expect(rows[0]?.submitFails).toBe(0);
    expect(rows[0]?.waitTicks).toBe(sample.waitTicks);
    expect(rows[0]?.address).toBe(bob.address);
    expect(rows[0]?.amount).toBe(sendAmount);
    expect(sendRawTransaction).toHaveBeenCalledTimes(0);
    expect(await queueForRuntime(rt).list()).toEqual([]);
    expect(readPendingRecords(rt.raw)).toEqual([]);
  });

  it("resolves a submit auto intent when the daemon returns a non-OK status", async () => {
    const fundAtomic = 5_000_000;
    const sendAmount = 0.5;
    const { bob, rt, sendRawTransaction } = await installFundedSender(fundAtomic, {
      sendRawTransaction: () => Promise.resolve({ status: "fail" }),
    });
    const { realSdkTransactionService } = await import(
      "@/lib/services/real-sdk/transaction.service"
    );
    const { enqueueAuto, listIntents } = await import("@/lib/services/real-sdk/send-intent");
    const { queueForRuntime } = await import("@/lib/services/real-sdk/outbound-queue");
    const { readPendingRecords } = await import("@/lib/services/real-sdk/pending-store");

    await realSdkTransactionService.sendTransaction({
      address: bob.address,
      amount: sendAmount,
    });

    const sample = enqueueAuto(
      {} as typeof rt,
      { address: bob.address, amount: sendAmount },
      "submit",
    );
    const rows = listIntents(rt);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("auto");
    expect(rows[0]?.submitFails).toBe(sample.submitFails);
    expect(rows[0]?.decoyFails).toBe(0);
    expect(rows[0]).not.toHaveProperty("hex");
    expect(rows[0]).not.toHaveProperty("serialized");
    expect(rows[0]).not.toHaveProperty("raw");
    expect(sendRawTransaction).toHaveBeenCalled();
    expect(await queueForRuntime(rt).list()).toEqual([]);
    expect(readPendingRecords(rt.raw)).toEqual([]);
  });

  it("resolves a submit auto intent when sendRawTransaction throws the SDK reject", async () => {
    const fundAtomic = 5_000_000;
    const sendAmount = 0.5;
    const { bob, rt, sendRawTransaction } = await installFundedSender(fundAtomic, {
      sendRawTransaction: () => Promise.reject(new Error("Failed to send raw transaction: fail")),
    });
    const { realSdkTransactionService } = await import(
      "@/lib/services/real-sdk/transaction.service"
    );
    const { enqueueAuto, listIntents } = await import("@/lib/services/real-sdk/send-intent");
    const { queueForRuntime } = await import("@/lib/services/real-sdk/outbound-queue");
    const { readPendingRecords } = await import("@/lib/services/real-sdk/pending-store");

    await realSdkTransactionService.sendTransaction({
      address: bob.address,
      amount: sendAmount,
    });

    const sample = enqueueAuto(
      {} as typeof rt,
      { address: bob.address, amount: sendAmount },
      "submit",
    );
    const rows = listIntents(rt);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("auto");
    expect(rows[0]?.submitFails).toBe(sample.submitFails);
    expect(rows[0]?.decoyFails).toBe(0);
    expect(rows[0]?.address).toBe(bob.address);
    expect(rows[0]?.amount).toBe(sendAmount);
    expect(rows[0]).not.toHaveProperty("hex");
    expect(rows[0]).not.toHaveProperty("serialized");
    expect(rows[0]).not.toHaveProperty("raw");
    expect(sendRawTransaction).toHaveBeenCalled();
    expect(await queueForRuntime(rt).list()).toEqual([]);
    expect(readPendingRecords(rt.raw)).toEqual([]);
  });

  it("enqueues a hung intent when sendRawTransaction never settles", async () => {
    const { submitHangMs } = await import("@/lib/services/real-sdk/spend");
    expect(typeof submitHangMs).toBe("number");
    expect(submitHangMs).toBeGreaterThan(0);

    const fundAtomic = 5_000_000;
    const sendAmount = 0.5;
    const { bob, rt, sendRawTransaction } = await installFundedSender(fundAtomic, {
      sendRawTransaction: () => new Promise(() => {}),
    });
    const { realSdkTransactionService } = await import(
      "@/lib/services/real-sdk/transaction.service"
    );
    const { listIntents } = await import("@/lib/services/real-sdk/send-intent");
    const { queueForRuntime } = await import("@/lib/services/real-sdk/outbound-queue");
    const { readPendingRecords } = await import("@/lib/services/real-sdk/pending-store");

    vi.useFakeTimers();
    const pending = realSdkTransactionService.sendTransaction({
      address: bob.address,
      amount: sendAmount,
    });
    await vi.advanceTimersByTimeAsync(submitHangMs);
    await pending;

    const rows = listIntents(rt);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("hung");
    expect(rows[0]?.watchedHash).toEqual(expect.any(String));
    expect(rows[0]?.watchedHash?.length).toBeGreaterThan(0);
    const queued = await realSdkTransactionService.listQueuedTransactions();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.hash).toBe(rows[0]?.watchedHash);
    expect(rows[0]).not.toHaveProperty("hex");
    expect(rows[0]).not.toHaveProperty("serialized");
    expect(rows[0]).not.toHaveProperty("raw");
    expect(sendRawTransaction).toHaveBeenCalled();
    expect(await queueForRuntime(rt).list()).toEqual([]);
    expect(readPendingRecords(rt.raw)).toEqual([]);
  });

  it("throws on first-try insufficient funds and does not enqueue", async () => {
    const fundAtomic = 5_000_000;
    const { bob, rt } = await installFundedSender(fundAtomic);
    const { FEE_ATOMIC } = await import("@/lib/services/real-sdk/spend");
    const spendable = getBalance(rt.state).spendable;
    expect(spendable).toBeGreaterThan(0);
    const feeAddress = await rt.daemon.getNodeFeeAddress();
    const nodeFeeAtomic = feeAddress ? REMOTE_NODE_FEE_ATOMIC : 0;
    const overAtomic = spendable + FEE_ATOMIC + nodeFeeAtomic + 1;
    const overAmount = overAtomic / 10 ** COIN_UNIT_PLACES;

    const { realSdkTransactionService } = await import(
      "@/lib/services/real-sdk/transaction.service"
    );
    const { listIntents } = await import("@/lib/services/real-sdk/send-intent");

    await expect(
      realSdkTransactionService.sendTransaction({ address: bob.address, amount: overAmount }),
    ).rejects.toThrow();
    expect(listIntents(rt)).toEqual([]);
  });

  it("throws unfunded send before a fee-address fail can enqueue", async () => {
    const fundAtomic = 5_000_000;
    const { bob, rt } = await installFundedSender(fundAtomic, {
      getNodeFeeAddress: () => Promise.reject(new Error("fee rpc down")),
    });
    const { FEE_ATOMIC } = await import("@/lib/services/real-sdk/spend");
    const spendable = getBalance(rt.state).spendable;
    expect(spendable).toBeGreaterThan(0);
    const overAtomic = spendable - FEE_ATOMIC + 1;
    expect(overAtomic + FEE_ATOMIC).toBeGreaterThan(spendable);
    const overAmount = overAtomic / 10 ** COIN_UNIT_PLACES;

    const { realSdkTransactionService } = await import(
      "@/lib/services/real-sdk/transaction.service"
    );
    const { listIntents } = await import("@/lib/services/real-sdk/send-intent");

    await expect(
      realSdkTransactionService.sendTransaction({ address: bob.address, amount: overAmount }),
    ).rejects.toThrow();
    expect(listIntents(rt)).toEqual([]);
  });

  it("keeps the OK pending hold and does not enqueue an intent", async () => {
    const fundAtomic = 5_000_000;
    const sendAmount = 0.5;
    const { bob, rt } = await installFundedSender(fundAtomic);
    const { realSdkTransactionService } = await import(
      "@/lib/services/real-sdk/transaction.service"
    );
    const { listIntents } = await import("@/lib/services/real-sdk/send-intent");
    const { readPendingRecords } = await import("@/lib/services/real-sdk/pending-store");

    await realSdkTransactionService.sendTransaction({
      address: bob.address,
      amount: sendAmount,
    });

    expect(readPendingRecords(rt.raw)).toHaveLength(1);
    expect(listIntents(rt)).toEqual([]);
  });

  it("lists and cancels the decoy intent by id", async () => {
    const fundAtomic = 5_000_000;
    const sendAmount = 0.5;
    const { bob, rt } = await installFundedSender(fundAtomic, {
      getRandomOuts: () => Promise.reject(new Error("decoys down")),
    });
    const { realSdkTransactionService } = await import(
      "@/lib/services/real-sdk/transaction.service"
    );
    const { listIntents } = await import("@/lib/services/real-sdk/send-intent");

    await realSdkTransactionService.sendTransaction({
      address: bob.address,
      amount: sendAmount,
    });
    const stored = listIntents(rt);
    expect(stored).toHaveLength(1);
    const id = stored[0]?.id;
    if (!id) throw new Error("expected decoy intent id");

    const listed = await realSdkTransactionService.listQueuedTransactions();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(id);
    expect(listed[0]?.kind).toBe("auto");
    expect(listed[0]?.hash).toBeUndefined();

    expect(await realSdkTransactionService.cancelQueuedTransaction(id)).toBe(true);
    expect(await realSdkTransactionService.listQueuedTransactions()).toEqual([]);
    expect(await realSdkTransactionService.cancelQueuedTransaction("intent-unknown-zz")).toBe(
      false,
    );
  });
});

describe("real-sdk submitHungIntent", () => {
  it("marks sent and does not rebuild when watchedHash is already in history", async () => {
    const { submitHangMs } = await import("@/lib/services/real-sdk/spend");
    const fundAtomic = 5_000_000;
    const sendAmount = 0.5;
    const { bob, rt, sendRawTransaction, networkHeight } = await installFundedSender(fundAtomic, {
      sendRawTransaction: () => new Promise(() => {}),
    });
    const { realSdkTransactionService } = await import(
      "@/lib/services/real-sdk/transaction.service"
    );
    const { listIntents } = await import("@/lib/services/real-sdk/send-intent");

    vi.useFakeTimers();
    const pending = realSdkTransactionService.sendTransaction({
      address: bob.address,
      amount: sendAmount,
    });
    await vi.advanceTimersByTimeAsync(submitHangMs);
    await pending;
    vi.useRealTimers();

    const hung = listIntents(rt)[0];
    if (!hung?.watchedHash) throw new Error("expected hung watchedHash");
    const firstHash = hung.watchedHash;
    const submitsBefore = sendRawTransaction.mock.calls.length;

    rt.state = {
      ...rt.state,
      transactions: [
        ...rt.state.transactions,
        { hash: firstHash, height: networkHeight, amount: 1, direction: "out" },
      ],
    };

    expect(await realSdkTransactionService.submitHungIntent(hung.id)).toBe(true);
    const after = listIntents(rt).find((row) => row.id === hung.id);
    expect(after?.sent).toBe(true);
    expect(after?.watchedHash).toBe(firstHash);
    expect(sendRawTransaction).toHaveBeenCalledTimes(submitsBefore);
  });

  it("rebuilds an unseen hung intent and drops it on OK submit", async () => {
    const { submitHangMs } = await import("@/lib/services/real-sdk/spend");
    const fundAtomic = 5_000_000;
    const sendAmount = 0.5;
    const { bob, rt, sendRawTransaction } = await installFundedSender(fundAtomic, {
      sendRawTransaction: () => new Promise(() => {}),
    });
    const { realSdkTransactionService } = await import(
      "@/lib/services/real-sdk/transaction.service"
    );
    const { listIntents } = await import("@/lib/services/real-sdk/send-intent");
    const { readPendingRecords } = await import("@/lib/services/real-sdk/pending-store");

    vi.useFakeTimers();
    const pending = realSdkTransactionService.sendTransaction({
      address: bob.address,
      amount: sendAmount,
    });
    await vi.advanceTimersByTimeAsync(submitHangMs);
    await pending;
    vi.useRealTimers();

    const hung = listIntents(rt)[0];
    if (!hung?.watchedHash) throw new Error("expected hung watchedHash");
    const firstHash = hung.watchedHash;
    const submitsBefore = sendRawTransaction.mock.calls.length;
    sendRawTransaction.mockImplementation(() => Promise.resolve({ status: "OK" }));

    expect(await realSdkTransactionService.submitHungIntent(hung.id)).toBe(true);
    expect(listIntents(rt).map((row) => row.id)).not.toContain(hung.id);
    expect(sendRawTransaction.mock.calls.length).toBeGreaterThan(submitsBefore);
    const rebuiltHash = readPendingRecords(rt.raw)[0]?.hash;
    expect(rebuiltHash).toEqual(expect.any(String));
    expect(rebuiltHash).not.toBe(firstHash);
  });

  it("returns false for an unknown id", async () => {
    const { realSdkTransactionService } = await import(
      "@/lib/services/real-sdk/transaction.service"
    );
    await installFundedSender(5_000_000);
    expect(await realSdkTransactionService.submitHungIntent("intent-unknown-zz")).toBe(false);
  });

  it("does not submit a hung intent while the wallet is catching up", async () => {
    const { submitHangMs } = await import("@/lib/services/real-sdk/spend");
    const { isWalletHeightSyncing } = await import("@/lib/ui/wallet-sync");
    const fundAtomic = 5_000_000;
    const sendAmount = 0.5;
    const { bob, rt, sendRawTransaction, networkHeight } = await installFundedSender(fundAtomic, {
      sendRawTransaction: () => new Promise(() => {}),
    });
    const { realSdkTransactionService } = await import(
      "@/lib/services/real-sdk/transaction.service"
    );
    const { listIntents } = await import("@/lib/services/real-sdk/send-intent");

    vi.useFakeTimers();
    const pending = realSdkTransactionService.sendTransaction({
      address: bob.address,
      amount: sendAmount,
    });
    await vi.advanceTimersByTimeAsync(submitHangMs);
    await pending;
    vi.useRealTimers();

    const hung = listIntents(rt)[0];
    if (!hung) throw new Error("expected hung intent");
    rt.state = { ...rt.state, scannedHeight: 0 };
    expect(isWalletHeightSyncing(rt.state.scannedHeight, networkHeight)).toBe(true);
    const submitsBefore = sendRawTransaction.mock.calls.length;
    sendRawTransaction.mockImplementation(() => Promise.resolve({ status: "OK" }));

    expect(await realSdkTransactionService.submitHungIntent(hung.id)).toBe(false);
    expect(listIntents(rt).find((row) => row.id === hung.id)?.sent).not.toBe(true);
    expect(sendRawTransaction).toHaveBeenCalledTimes(submitsBefore);
  });
});

describe("real-sdk finalizeSyncPass intent drain", () => {
  it("submits a due auto intent on synced syncRuntime and leaves the hex queue empty", async () => {
    const fundAtomic = 5_000_000;
    const sendAmount = 0.5;
    const { bob, rt, runtimeMod, sendRawTransaction, networkHeight } =
      await installFundedSender(fundAtomic);
    const { enqueueAuto, listIntents, tickSynced } = await import(
      "@/lib/services/real-sdk/send-intent"
    );
    const { queueForRuntime } = await import("@/lib/services/real-sdk/outbound-queue");
    const { readPendingRecords } = await import("@/lib/services/real-sdk/pending-store");
    const { isWalletHeightSyncing } = await import("@/lib/ui/wallet-sync");

    const queued = enqueueAuto(rt, { address: bob.address, amount: sendAmount }, "decoy");
    const ticksLeft = listIntents(rt).find((row) => row.id === queued.id)?.waitTicks;
    if (ticksLeft === undefined) {
      throw new Error("auto enqueue missing waitTicks");
    }
    for (let i = 0; i < ticksLeft; i++) {
      tickSynced(rt);
    }
    expect(listIntents(rt)[0]?.waitTicks).toBe(0);
    expect(isWalletHeightSyncing(rt.state.scannedHeight, networkHeight)).toBe(false);
    expect(sendRawTransaction).toHaveBeenCalledTimes(0);
    const pendingBefore = readPendingRecords(rt.raw);

    await runtimeMod.syncRuntime(rt);

    expect(sendRawTransaction).toHaveBeenCalled();
    expect(await queueForRuntime(rt).list()).toEqual([]);
    expect(listIntents(rt).map((row) => row.id)).not.toContain(queued.id);
    const pendingAfter = readPendingRecords(rt.raw);
    expect(pendingAfter).toHaveLength(pendingBefore.length + 1);
  });

  it("does not count a locked runtime as a submit fail", async () => {
    const fundAtomic = 5_000_000;
    const sendAmount = 0.5;
    const { bob, rt, runtimeMod } = await installFundedSender(fundAtomic);
    const { enqueueAuto, listIntents } = await import("@/lib/services/real-sdk/send-intent");
    const { rebuildSend } = await import("@/lib/services/real-sdk/intent-drain");

    const queued = enqueueAuto(rt, { address: bob.address, amount: sendAmount }, "submit");
    const failsBefore = listIntents(rt).find((row) => row.id === queued.id)?.submitFails;
    if (failsBefore === undefined) {
      throw new Error("auto enqueue missing submitFails");
    }

    runtimeMod._setRuntimeForTest(null);
    const result = await rebuildSend(rt, queued);
    expect(result).toBe("skip");
    expect(listIntents(rt).find((row) => row.id === queued.id)?.submitFails).toBe(failsBefore);
  });
});

describe("real-sdk send path ignores leftover hex outbox", () => {
  it("keeps a leftover-queued output selectable and does not enqueue a second hex", async () => {
    const fundAtomic = 5_000_000;
    const leftoverHash = "leftover1";
    const { bob, rt } = await installFundedSender(fundAtomic);
    const { FEE_ATOMIC, selectableOutputs } = await import("@/lib/services/real-sdk/spend");
    const { realSdkTransactionService } = await import(
      "@/lib/services/real-sdk/transaction.service"
    );
    const { queueForRuntime } = await import("@/lib/services/real-sdk/outbound-queue");

    const funded = rt.state.outputs[0];
    if (!funded) throw new Error("expected funded output");
    expect(funded.amount).toBe(fundAtomic);
    expect(funded.amount).toBeGreaterThan(FEE_ATOMIC);
    const sendAmount = (funded.amount - FEE_ATOMIC) / 10 ** COIN_UNIT_PLACES;

    await queueForRuntime(rt).enqueue(leftoverHex(leftoverHash, funded.keyImage));
    expect((await queueForRuntime(rt).list()).map((row) => row.hash)).toEqual([leftoverHash]);

    const selectable = await selectableOutputs(rt);
    expect(selectable.map((out) => out.keyImage)).toContain(funded.keyImage);

    await expect(
      realSdkTransactionService.sendTransaction({
        address: bob.address,
        amount: sendAmount,
      }),
    ).resolves.toMatchObject({ type: "send", address: bob.address });

    expect((await queueForRuntime(rt).list()).map((row) => row.hash)).toEqual([leftoverHash]);
  });
});
