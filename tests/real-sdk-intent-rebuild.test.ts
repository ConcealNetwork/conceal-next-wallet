// @vitest-environment node

// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import {
  type Account,
  COIN_UNIT_PLACES,
  createAccount,
  createWalletState,
  crypto,
  DEPOSIT_MIN_TERM_BLOCK,
  init,
  type RawWalletV1,
  type transactions as txns,
  type WalletKeys,
} from "conceal-wallet-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readIncomingPendingRecords } from "@/lib/services/real-sdk/incoming-pending-store";
import { drainIntents, type RebuildResult } from "@/lib/services/real-sdk/intent-drain";
import { readPendingRecords } from "@/lib/services/real-sdk/pending-store";
import type { SdkRuntime } from "@/lib/services/real-sdk/runtime-registry";
import { scanRawTransaction } from "@/lib/services/real-sdk/scan";
import {
  clearIntents,
  enqueueAuto,
  listIntents,
  takeDropToast,
  tickSynced,
  type WalletIntent,
} from "@/lib/services/real-sdk/send-intent";

const ATOMIC = 10 ** COIN_UNIT_PLACES;
const TERM = DEPOSIT_MIN_TERM_BLOCK; // minimum whole-month term
const NETWORK_HEIGHT = 50_000;
/** Mined long enough ago that a minimum-term deposit is unlocked at NETWORK_HEIGHT. */
const MINED_HEIGHT = NETWORK_HEIGHT - TERM - 10;
const RECENT_HEIGHT = NETWORK_HEIGHT - 10; // still inside the term → locked
const DEPOSIT_TX_HASH = "bb".repeat(32);

function fundOwnedOutput(owner: Account, amount: number): txns.SpendableOutput {
  const txKeys = crypto.generateKeys(crypto.randomSeed());
  const derivation = crypto.generateKeyDerivation(txKeys.pub, owner.keys.view.sec);
  const publicKey = crypto.derivePublicKey(derivation, 0, owner.keys.spend.pub);
  const ephemeralSecret = crypto.deriveSecretKey(derivation, 0, owner.keys.spend.sec);
  const keyImage = crypto.generateKeyImage(publicKey, ephemeralSecret);
  return {
    amount,
    globalIndex: 1000,
    outputIndex: 0,
    txPublicKey: txKeys.pub,
    publicKey,
    keyImage,
  };
}

/** Pretty-denomination inputs for building a deposit inside the test wallet. */
function makeInputs(owner: Account, amounts: number[]): txns.SpendableOutput[] {
  return amounts.map((amount, i) => {
    const txKeys = crypto.generateKeys(crypto.randomSeed());
    const derivation = crypto.generateKeyDerivation(txKeys.pub, owner.keys.view.sec);
    const publicKey = crypto.derivePublicKey(derivation, i, owner.keys.spend.pub);
    const ephemeralSecret = crypto.deriveSecretKey(derivation, i, owner.keys.spend.sec);
    const keyImage = crypto.generateKeyImage(publicKey, ephemeralSecret);
    return {
      amount,
      globalIndex: 2000 + i,
      outputIndex: 0,
      txPublicKey: txKeys.pub,
      publicKey,
      keyImage,
    };
  });
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
  getHeight?: () => Promise<number>;
};

type Installed = {
  alice: Account;
  rt: SdkRuntime;
  sendRawTransaction: ReturnType<typeof vi.fn>;
  getRandomOuts: ReturnType<typeof vi.fn>;
};

async function installRuntime(fundAtomic: number, hooks: DaemonHooks = {}): Promise<Installed> {
  const alice = createAccount("english");
  const aliceOutput = fundOwnedOutput(alice, fundAtomic);
  const sendRawTransaction = vi.fn(
    hooks.sendRawTransaction ?? (() => Promise.resolve({ status: "OK" })),
  );
  const getRandomOuts = vi.fn(
    hooks.getRandomOuts ??
      ((amounts: number[], count: number) => Promise.resolve(decoyReply(amounts, count))),
  );
  const fakeDaemon = {
    nodeUrl: "https://node.test/",
    getHeight: hooks.getHeight ?? (() => Promise.resolve(NETWORK_HEIGHT)),
    getNodeFeeAddress: hooks.getNodeFeeAddress ?? (() => Promise.resolve("")),
    sendRawTransaction,
    getRandomOuts,
    getWalletSyncData: () => Promise.resolve([]),
    getTransactionsPool: () => Promise.resolve([]),
  };
  const runtimeMod = await import("@/lib/services/real-sdk/runtime");
  runtimeMod._setRuntimeForTest({
    account: alice,
    raw: emptyRaw(alice, NETWORK_HEIGHT),
    state: { ...createWalletState(alice), outputs: [aliceOutput], scannedHeight: NETWORK_HEIGHT },
    // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
    daemon: fakeDaemon as any,
    password: "test-password",
    viewOnly: false,
    storage: {
      getItem: () => Promise.resolve(null),
      setItem: () => Promise.resolve(),
      removeItem: () => Promise.resolve(),
      keys: () => Promise.resolve([]),
    },
  });
  const rt = runtimeMod.getRuntime();
  if (rt === null) throw new Error("runtime missing after install");
  return { alice, rt, sendRawTransaction, getRandomOuts };
}

type OwnedDepositFixture = NonNullable<
  ReturnType<typeof scanRawTransaction>
>["ownedDeposits"][number];

/** A real owned deposit entry (produced by building + scanning a deposit tx). */
function makeOwnedDeposit(
  owner: Account,
  built: txns.BuiltTransaction,
  amount: number,
): OwnedDepositFixture {
  const depKey = built.outputs[0]?.publicKey as string;
  const result = scanRawTransaction(
    {
      transaction: {
        extra: built.extra,
        vin: [],
        vout: [
          {
            amount: String(amount),
            target: {
              type: "txout_to_deposit_key",
              data: { keys: [depKey], required_signatures: 1, term: String(TERM) },
            },
          },
        ],
      },
      timestamp: 1_700_000_000,
      outputIndexes: [424242],
      height: MINED_HEIGHT,
      blockHash: "aa".repeat(32),
      hash: DEPOSIT_TX_HASH,
      fee: 1000,
    },
    { spend: owner.keys.spend, view: owner.keys.view } as WalletKeys,
  );
  const owned = result?.ownedDeposits[0];
  if (!owned) throw new Error("failed to produce an owned deposit fixture");
  return owned;
}

/** A real, unlocked, unspent owned deposit placed in the test wallet's state. */
async function seedUnlockedDeposit(alice: Account, rt: SdkRuntime, depositAmount: number) {
  const { transactions } = await import("conceal-wallet-sdk");
  const fee = 1000;
  const depositTx = transactions.buildDepositTransaction({
    keys: alice.keys,
    amount: depositAmount,
    termBlocks: TERM,
    ownKeys: { spendPublicKey: alice.keys.spend.pub, viewPublicKey: alice.keys.view.pub },
    unspentOutputs: makeInputs(alice, [depositAmount, fee]),
    decoys: [],
    fee,
    mixin: 0,
  });
  const owned = makeOwnedDeposit(alice, depositTx, depositAmount);
  rt.state = {
    ...rt.state,
    deposits: [{ ...owned, blockHeight: MINED_HEIGHT, txHash: DEPOSIT_TX_HASH }],
  };
  return { owned, depositTx };
}

/** Rebuild one intent through the real drain loop (applyRebuild bookkeeping included). */
async function drainOne(
  rt: SdkRuntime,
  rebuild: (rt: SdkRuntime, target: WalletIntent) => Promise<RebuildResult>,
): Promise<void> {
  tickSynced(rt);
  tickSynced(rt);
  await drainIntents(rt, {
    scannedHeight: rt.state.scannedHeight,
    networkHeight: NETWORK_HEIGHT,
    historyHashes: new Set<string>(),
    isLive: () => true,
    rebuild: (row) => rebuild(rt, row),
  });
}

type PendingRecordLike = ReturnType<typeof readPendingRecords>[number];

function pendingByType(rt: SdkRuntime, type: PendingRecordLike["type"]): PendingRecordLike[] {
  return readPendingRecords(rt.raw).filter((record) => record.type === type);
}

afterEach(async () => {
  const { getRuntime, _setRuntimeForTest } = await import("@/lib/services/real-sdk/runtime");
  const rt = getRuntime();
  if (rt) clearIntents(rt);
  _setRuntimeForTest(null);
});

describe("per-kind intent rebuilds (deposit / withdraw / message / fusion)", () => {
  it("rebuilds a deposit intent through the shared pipeline and lands the pending record", async () => {
    await init();
    const { rt, sendRawTransaction } = await installRuntime(20 * ATOMIC);
    const { rebuildDeposit } = await import("@/lib/services/real-sdk/intent-drain");

    enqueueAuto(rt, { kind: "deposit", amount: 2, durationMonths: 1 }, "decoy");
    await drainOne(rt, rebuildDeposit);
    expect(listIntents(rt)).toEqual([]);
    expect(sendRawTransaction).toHaveBeenCalledOnce();
    expect(pendingByType(rt, "deposit")).toHaveLength(1);
    expect(readIncomingPendingRecords(rt.raw)).toEqual([]);
  });

  it("drops an underfunded deposit intent silently and never submits", async () => {
    await init();
    // One 4 CCX output cannot cover a 4 CCX deposit + network fee → unfunded.
    const { rt, sendRawTransaction } = await installRuntime(4 * ATOMIC);
    const { rebuildDeposit } = await import("@/lib/services/real-sdk/intent-drain");

    enqueueAuto(rt, { kind: "deposit", amount: 4, durationMonths: 1 }, "decoy");
    await drainOne(rt, rebuildDeposit);
    expect(listIntents(rt)).toEqual([]);
    expect(takeDropToast(rt)).toBeUndefined();
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });

  it("drops a withdraw intent silently when locked or gone, rebuilds when unlocked", async () => {
    await init();
    const depositAmount = 5 * ATOMIC;
    const { alice, rt, sendRawTransaction } = await installRuntime(20 * ATOMIC);
    const { rebuildWithdraw } = await import("@/lib/services/real-sdk/intent-drain");
    const { rebuildIntent } = await import("@/lib/services/real-sdk/intent-drain");
    const { owned } = await seedUnlockedDeposit(alice, rt, depositAmount);
    const depositRef = { txHash: DEPOSIT_TX_HASH, globalOutputIndex: owned.globalIndex };

    // Locked again (term not elapsed) → silent unfunded drop.
    enqueueAuto(rt, { kind: "withdraw", ...depositRef }, "submit");
    rt.state = {
      ...rt.state,
      deposits: [{ ...owned, blockHeight: RECENT_HEIGHT, txHash: DEPOSIT_TX_HASH }],
    };
    await drainOne(rt, rebuildWithdraw);
    expect(listIntents(rt)).toEqual([]);
    expect(takeDropToast(rt)).toBeUndefined();
    expect(sendRawTransaction).not.toHaveBeenCalled();

    // Missing deposit → silent drop too.
    enqueueAuto(rt, { kind: "withdraw", txHash: "cc".repeat(32), globalOutputIndex: 7 }, "submit");
    await drainOne(rt, rebuildWithdraw);
    expect(listIntents(rt)).toEqual([]);

    // Unlocked + unspent again → full rebuild, pending withdrawal recorded.
    rt.state = {
      ...rt.state,
      deposits: [{ ...owned, blockHeight: MINED_HEIGHT, txHash: DEPOSIT_TX_HASH }],
    };
    enqueueAuto(rt, { kind: "withdraw", ...depositRef }, "submit");
    await drainOne(rt, rebuildIntent);
    expect(listIntents(rt)).toEqual([]);
    expect(sendRawTransaction).toHaveBeenCalledOnce();
    const withdrawal = pendingByType(rt, "withdrawal")[0];
    expect(withdrawal?.depositRef).toEqual({
      txHash: DEPOSIT_TX_HASH,
      globalIndex: owned.globalIndex,
    });
  });

  it("drops an expired-TTL message intent silently and rebuilds a live one", async () => {
    await init();
    const { alice, rt, sendRawTransaction } = await installRuntime(5 * ATOMIC);
    const { rebuildMessage } = await import("@/lib/services/real-sdk/intent-drain");
    const { readSentRecords } = await import("@/lib/services/real-sdk/messages-store");

    const expired = Math.floor(Date.now() / 1000) - 60;
    enqueueAuto(
      rt,
      { kind: "message", recipientAddress: alice.address, body: "late", ttlUnixSeconds: expired },
      "decoy",
    );
    await drainOne(rt, rebuildMessage);
    expect(listIntents(rt)).toEqual([]);
    expect(takeDropToast(rt)).toBeUndefined();
    expect(sendRawTransaction).not.toHaveBeenCalled();

    enqueueAuto(
      rt,
      { kind: "message", recipientAddress: alice.address, body: "hello again" },
      "decoy",
    );
    await drainOne(rt, rebuildMessage);
    expect(listIntents(rt)).toEqual([]);
    expect(sendRawTransaction).toHaveBeenCalledOnce();
    expect(readSentRecords(rt.raw)).toHaveLength(1);
  });

  it("drops a fusion intent silently when one output cannot be fused", async () => {
    await init();
    const { rt, sendRawTransaction } = await installRuntime(50 * ATOMIC);
    const { rebuildFusion } = await import("@/lib/services/real-sdk/intent-drain");
    const { isOptimizationNeeded, OPTIMIZE_OUTPUTS } = await import("conceal-wallet-sdk");

    expect(rt.state.outputs.length).toBeLessThan(OPTIMIZE_OUTPUTS);
    expect(
      isOptimizationNeeded({
        unspentOutputs: rt.state.outputs,
        balance: 50 * ATOMIC,
        blockchainHeight: NETWORK_HEIGHT,
      }).isNeeded,
    ).toBe(false);

    enqueueAuto(rt, { kind: "fusion" }, "decoy");
    await drainOne(rt, rebuildFusion);
    expect(listIntents(rt)).toEqual([]);
    expect(takeDropToast(rt)).toBeUndefined();
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });

  it("rebuilds a fusion intent when a full bucket of pretty outputs is fuseable", async () => {
    await init();
    const { alice, rt, sendRawTransaction } = await installRuntime(0);
    const { rebuildFusion } = await import("@/lib/services/real-sdk/intent-drain");
    const { isOptimizationNeeded, OPTIMIZE_OUTPUTS } = await import("conceal-wallet-sdk");

    const amount = 10_000_000;
    rt.state = {
      ...rt.state,
      outputs: Array.from({ length: OPTIMIZE_OUTPUTS }, (_, index) => {
        const output = fundOwnedOutput(alice, amount);
        return { ...output, globalIndex: 4000 + index };
      }),
    };
    expect(
      isOptimizationNeeded({
        unspentOutputs: rt.state.outputs,
        balance: OPTIMIZE_OUTPUTS * amount,
        blockchainHeight: NETWORK_HEIGHT,
      }).isNeeded,
    ).toBe(true);

    enqueueAuto(rt, { kind: "fusion" }, "decoy");
    await drainOne(rt, rebuildFusion);
    expect(listIntents(rt)).toEqual([]);
    expect(sendRawTransaction).toHaveBeenCalledOnce();
    expect(pendingByType(rt, "fusion")).toHaveLength(1);
  });
});

describe("rebuildSend failure mapping (pinned to the shared pipelineToRebuildResult classification)", () => {
  it("maps a relay reject to submit and a decoy-fetch failure to decoy", async () => {
    await init();
    const { alice, rt } = await installRuntime(5 * ATOMIC, {
      sendRawTransaction: () => Promise.resolve({ status: "Rejected: bad promise" }),
    });
    const { rebuildSend } = await import("@/lib/services/real-sdk/intent-drain");

    const send = (address: string) => {
      enqueueAuto(rt, { kind: "send", address, amount: 1 }, "submit");
      const row = listIntents(rt).at(-1);
      if (!row) throw new Error("send intent missing after enqueue");
      return row;
    };

    expect(await rebuildSend(rt, send(alice.address))).toBe("submit");

    rt.daemon.getRandomOuts = () => Promise.reject(new Error("decoys down"));
    expect(await rebuildSend(rt, send(alice.address))).toBe("decoy");
  });

  it("parks a timed-out submit as a hung result carrying the built hash", async () => {
    await init();
    const { alice, rt, sendRawTransaction } = await installRuntime(5 * ATOMIC, {
      sendRawTransaction: () => Promise.reject(new Error("Daemon request timed out after 10000ms")),
    });
    const { rebuildSend } = await import("@/lib/services/real-sdk/intent-drain");

    enqueueAuto(rt, { kind: "send", address: alice.address, amount: 1 }, "submit");
    const row = listIntents(rt)[0];
    if (!row) throw new Error("send intent missing after enqueue");

    const result = await rebuildSend(rt, row);
    expect(result).toEqual({ hung: expect.any(String) });
    if (typeof result !== "string" && result.hung.length === 0) {
      throw new Error("timed-out send must carry the built hash for double-pay protection");
    }
    expect(sendRawTransaction).toHaveBeenCalledOnce();
  });

  it("maps an underfunded rebuild to a silent unfunded drop", async () => {
    await init();
    const { alice, rt, sendRawTransaction } = await installRuntime(1 * ATOMIC);
    const { rebuildSend } = await import("@/lib/services/real-sdk/intent-drain");

    enqueueAuto(rt, { kind: "send", address: alice.address, amount: 5 }, "submit");
    const row = listIntents(rt)[0];
    if (!row) throw new Error("send intent missing after enqueue");

    expect(await rebuildSend(rt, row)).toBe("unfunded");
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });
});

describe("queued field propagation (interactive returns)", () => {
  it("createDeposit returns a queued auto deposit when decoys fail, throwing when unfunded", async () => {
    await init();
    const { rt } = await installRuntime(20 * ATOMIC, {
      getRandomOuts: () => Promise.reject(new Error("decoys down")),
    });
    const { realSdkDepositService } = await import("@/lib/services/real-sdk/deposit.service");

    const deposit = await realSdkDepositService.createDeposit({
      amount: 2,
      durationMonths: 12,
    });
    expect(deposit.queued).toBe("auto");
    expect(deposit.txHash).not.toBe("");
    const rows = listIntents(rt);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("deposit");
    expect(rows[0]?.state).toBe("auto");

    await expect(
      realSdkDepositService.createDeposit({ amount: 999, durationMonths: 12 }),
    ).rejects.toThrow("Not enough unlocked balance for deposit and network fee.");
    expect(listIntents(rt)).toHaveLength(1);
  });

  it("withdrawDeposit parks an auto intent on a relay reject and throws when locked", async () => {
    await init();
    const depositAmount = 5 * ATOMIC;
    const { alice, rt } = await installRuntime(20 * ATOMIC, {
      sendRawTransaction: () => Promise.resolve({ status: "Rejected: bad promise" }),
    });
    const { owned } = await seedUnlockedDeposit(alice, rt, depositAmount);
    const { realSdkDepositService } = await import("@/lib/services/real-sdk/deposit.service");

    const result = await realSdkDepositService.withdrawDeposit({
      txHash: DEPOSIT_TX_HASH,
      globalOutputIndex: owned.globalIndex,
    });
    expect(result.queued).toBe("auto");
    expect(result.type).toBe("withdrawal");
    const rows = listIntents(rt);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("withdraw");
    expect(rows[0]?.payload).toEqual({
      txHash: DEPOSIT_TX_HASH,
      globalOutputIndex: owned.globalIndex,
    });

    // Locked deposit (term not elapsed) stays a visible interactive error.
    clearIntents(rt);
    rt.state = {
      ...rt.state,
      deposits: [{ ...owned, blockHeight: RECENT_HEIGHT, txHash: DEPOSIT_TX_HASH }],
    };
    await expect(
      realSdkDepositService.withdrawDeposit({
        txHash: DEPOSIT_TX_HASH,
        globalOutputIndex: owned.globalIndex,
      }),
    ).rejects.toThrow("Deposit is still locked.");
  });

  it("sendMessage parks an auto intent when decoys fail and returns a queued Message", async () => {
    await init();
    const { alice, rt } = await installRuntime(5 * ATOMIC, {
      getRandomOuts: () => Promise.reject(new Error("decoys down")),
    });
    const { realSdkMessageService } = await import("@/lib/services/real-sdk/message.service");
    const { readSentRecords } = await import("@/lib/services/real-sdk/messages-store");

    const sent = await realSdkMessageService.sendMessage({
      recipientAddress: alice.address,
      body: "park me",
    });
    expect(sent.queued).toBe("auto");
    const rows = listIntents(rt);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("message");
    expect(rows[0]?.payload).toMatchObject({
      recipientAddress: alice.address,
      body: "park me",
    });
    // No phantom sent copy is persisted for a merely-parked message.
    expect(readSentRecords(rt.raw)).toEqual([]);
  });

  it("optimizeWallet returns nothing-to-optimize without parking when one output is present", async () => {
    await init();
    const { rt } = await installRuntime(50 * ATOMIC);
    const { realSdkSettingsService } = await import("@/lib/services/real-sdk/settings.service");

    const result = await realSdkSettingsService.optimizeWallet();
    expect(result.optimized).toBe(false);
    expect(result.queued).toBeUndefined();
    expect(listIntents(rt)).toEqual([]);
  });

  it("parks a hung withdraw when submit times out and writes no pending record", async () => {
    await init();
    const depositAmount = 5 * ATOMIC;
    const { alice, rt } = await installRuntime(20 * ATOMIC, {
      sendRawTransaction: () => Promise.reject(new Error("Daemon request timed out after 10000ms")),
    });
    const { owned } = await seedUnlockedDeposit(alice, rt, depositAmount);
    const { realSdkDepositService } = await import("@/lib/services/real-sdk/deposit.service");

    const result = await realSdkDepositService.withdrawDeposit({
      txHash: DEPOSIT_TX_HASH,
      globalOutputIndex: owned.globalIndex,
    });
    expect(result.queued).toBe("hung");
    const rows = listIntents(rt);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("withdraw");
    expect(rows[0]?.state).toBe("hung");
    expect(rows[0]?.watchedHash).toBe(result.hash);
    expect(pendingByType(rt, "withdrawal")).toEqual([]);
  });

  it("parks an auto withdraw when getHeight rejects with timed out and does not submit", async () => {
    await init();
    const depositAmount = 5 * ATOMIC;
    const { alice, rt, sendRawTransaction } = await installRuntime(20 * ATOMIC, {
      getHeight: () => Promise.reject(new Error("Daemon request timed out after 10000ms")),
    });
    const { owned } = await seedUnlockedDeposit(alice, rt, depositAmount);
    const { realSdkDepositService } = await import("@/lib/services/real-sdk/deposit.service");

    const result = await realSdkDepositService.withdrawDeposit({
      txHash: DEPOSIT_TX_HASH,
      globalOutputIndex: owned.globalIndex,
    });
    expect(result.queued).toBe("auto");
    const rows = listIntents(rt);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.state).toBe("auto");
    expect(rows[0]?.kind).toBe("withdraw");
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });

  it("parks an auto withdraw when getHeight never returns and a late height does not submit", async () => {
    await init();
    const depositAmount = 5 * ATOMIC;
    const { alice, rt, sendRawTransaction } = await installRuntime(20 * ATOMIC);
    const { owned } = await seedUnlockedDeposit(alice, rt, depositAmount);
    const waiters: Array<(height: number) => void> = [];
    rt.daemon.getHeight = () =>
      new Promise((resolve) => {
        waiters.push(resolve);
      });
    const { connectHangMs, probeHangMs } = await import("@/lib/services/real-sdk/spend");
    const { realSdkDepositService } = await import("@/lib/services/real-sdk/deposit.service");

    vi.useFakeTimers();
    try {
      const pending = realSdkDepositService.withdrawDeposit({
        txHash: DEPOSIT_TX_HASH,
        globalOutputIndex: owned.globalIndex,
      });
      await vi.advanceTimersByTimeAsync(connectHangMs + probeHangMs);
      const result = await pending;
      expect(result.queued).toBe("auto");
      expect(listIntents(rt)).toHaveLength(1);
      expect(sendRawTransaction).not.toHaveBeenCalled();

      for (const release of waiters) release(NETWORK_HEIGHT);
      await vi.advanceTimersByTimeAsync(0);
      expect(sendRawTransaction).not.toHaveBeenCalled();
      expect(listIntents(rt)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("parks an auto fusion when optimize getHeight never returns", async () => {
    await init();
    const { rt, sendRawTransaction } = await installRuntime(50 * ATOMIC);
    const waiters: Array<(height: number) => void> = [];
    rt.daemon.getHeight = () =>
      new Promise((resolve) => {
        waiters.push(resolve);
      });
    const { connectHangMs, probeHangMs } = await import("@/lib/services/real-sdk/spend");
    const { realSdkSettingsService } = await import("@/lib/services/real-sdk/settings.service");

    vi.useFakeTimers();
    try {
      const pending = realSdkSettingsService.optimizeWallet();
      await vi.advanceTimersByTimeAsync(connectHangMs + probeHangMs);
      const result = await pending;
      expect(result.queued).toBe("auto");
      expect(result.optimized).toBe(false);
      expect(listIntents(rt)[0]?.kind).toBe("fusion");
      expect(listIntents(rt)[0]?.state).toBe("auto");
      expect(sendRawTransaction).not.toHaveBeenCalled();

      for (const release of waiters) release(NETWORK_HEIGHT);
      await vi.advanceTimersByTimeAsync(0);
      expect(sendRawTransaction).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
