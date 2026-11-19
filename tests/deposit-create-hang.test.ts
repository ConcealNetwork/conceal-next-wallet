// @vitest-environment node

// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import {
  createAccount,
  createWalletState,
  crypto,
  init,
  type transactions as txns,
} from "conceal-wallet-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

function fundOwnedOutput(
  owner: ReturnType<typeof createAccount>,
  amount: number,
): txns.SpendableOutput {
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

function decoyReply(amounts: number[], count: number) {
  return amounts.map((amount) => ({
    amount,
    outs: Array.from({ length: count }, (_, i) => ({
      globalIndex: 3000 + i,
      publicKey: crypto.generateKeys(crypto.randomSeed()).pub,
    })),
  }));
}

type Hooks = {
  fee?: () => Promise<string>;
  height?: () => Promise<number>;
  submit?: () => Promise<{ status: string }>;
};

async function install(hooks: Hooks = {}) {
  await init();
  const alice = createAccount("english");
  const sendRawTransaction = vi.fn(hooks.submit ?? (() => Promise.resolve({ status: "OK" })));
  const getNodeFeeAddress = vi.fn(hooks.fee ?? (() => Promise.resolve("")));
  const runtimeMod = await import("@/lib/services/real-sdk/runtime");
  runtimeMod._setRuntimeForTest({
    account: alice,
    raw: {
      deposits: [],
      withdrawals: [],
      transactions: [],
      lastHeight: 10,
      nonce: "",
      options: {},
    },
    state: {
      ...createWalletState(alice),
      scannedHeight: 10,
      outputs: [fundOwnedOutput(alice, 5_000_000)],
    },
    daemon: {
      nodeUrl: "https://node.test/",
      getHeight: hooks.height ?? (() => Promise.resolve(10)),
      getNodeFeeAddress,
      sendRawTransaction,
      getRandomOuts: (amounts: number[], count: number) =>
        Promise.resolve(decoyReply(amounts, count)),
      getWalletSyncData: () => Promise.resolve([]),
      getTransactionsPool: () => Promise.resolve([]),
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub
    } as any,
    password: "pw",
    viewOnly: false,
    storage: {
      getItem: () => Promise.resolve(null),
      setItem: () => Promise.resolve(),
      removeItem: () => Promise.resolve(),
      keys: () => Promise.resolve([]),
    },
  });
  const rt = runtimeMod.getRuntime();
  if (!rt) throw new Error("runtime missing");
  return { rt, sendRawTransaction, getNodeFeeAddress };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  const { getRuntime } = await import("@/lib/services/real-sdk/runtime");
  const { clearIntents } = await import("@/lib/services/real-sdk/send-intent");
  const rt = getRuntime();
  if (rt) clearIntents(rt);
});

describe("createDeposit hang window", () => {
  it("parks an auto intent when the tab is offline and does not call the node", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const { rt, sendRawTransaction, getNodeFeeAddress } = await install();
    const { realSdkDepositService } = await import("@/lib/services/real-sdk/deposit.service");
    const { listIntents } = await import("@/lib/services/real-sdk/send-intent");

    const deposit = await realSdkDepositService.createDeposit({ amount: 1, durationMonths: 1 });

    expect(deposit.queued).toBe("auto");
    expect(listIntents(rt)).toHaveLength(1);
    expect(listIntents(rt)[0]?.kind).toBe("deposit");
    expect(getNodeFeeAddress).not.toHaveBeenCalled();
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });

  it("parks an auto intent when the fee call times out before a hash exists", async () => {
    const { rt, sendRawTransaction } = await install({
      fee: () => Promise.reject(new Error("Daemon request timed out after 10000ms")),
    });
    const { realSdkDepositService } = await import("@/lib/services/real-sdk/deposit.service");
    const { listIntents } = await import("@/lib/services/real-sdk/send-intent");

    const deposit = await realSdkDepositService.createDeposit({ amount: 1, durationMonths: 1 });

    expect(deposit.queued).toBe("auto");
    expect(listIntents(rt)[0]?.state).toBe("auto");
    expect(listIntents(rt)[0]?.watchedHash).toBeUndefined();
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });

  it("parks an auto intent when the fee call never returns and a late fee does not submit", async () => {
    const waiters: Array<(fee: string) => void> = [];
    const { rt, sendRawTransaction } = await install({
      fee: () =>
        new Promise((resolve) => {
          waiters.push(resolve);
        }),
      height: () => new Promise(() => {}),
    });
    const { connectHangMs, probeHangMs } = await import("@/lib/services/real-sdk/spend");
    const { realSdkDepositService } = await import("@/lib/services/real-sdk/deposit.service");
    const { listIntents } = await import("@/lib/services/real-sdk/send-intent");

    vi.useFakeTimers();
    const pending = realSdkDepositService.createDeposit({ amount: 1, durationMonths: 1 });
    await vi.advanceTimersByTimeAsync(connectHangMs + probeHangMs);
    const deposit = await pending;

    expect(deposit.queued).toBe("auto");
    expect(listIntents(rt)).toHaveLength(1);
    expect(sendRawTransaction).not.toHaveBeenCalled();

    for (const release of waiters) release("");
    await vi.advanceTimersByTimeAsync(0);
    expect(sendRawTransaction).not.toHaveBeenCalled();
    expect(listIntents(rt)).toHaveLength(1);
  });

  it("parks hung with the hash when submit times out after the deposit is built", async () => {
    const { rt, sendRawTransaction } = await install({
      submit: () => Promise.reject(new Error("Daemon request timed out after 10000ms")),
    });
    const { realSdkDepositService } = await import("@/lib/services/real-sdk/deposit.service");
    const { listIntents } = await import("@/lib/services/real-sdk/send-intent");

    const deposit = await realSdkDepositService.createDeposit({ amount: 1, durationMonths: 1 });

    expect(deposit.queued).toBe("hung");
    expect(sendRawTransaction).toHaveBeenCalledOnce();
    expect(listIntents(rt)[0]?.state).toBe("hung");
    expect(listIntents(rt)[0]?.watchedHash).toBe(deposit.txHash);
  });

  it("returns the relayed deposit without waiting on a height call that never returns", async () => {
    const { rt, sendRawTransaction } = await install({ height: () => new Promise(() => {}) });
    const { realSdkDepositService } = await import("@/lib/services/real-sdk/deposit.service");
    const { listIntents } = await import("@/lib/services/real-sdk/send-intent");

    const deposit = await realSdkDepositService.createDeposit({ amount: 1, durationMonths: 1 });

    expect(deposit.queued).toBeUndefined();
    expect(sendRawTransaction).toHaveBeenCalledOnce();
    expect(listIntents(rt)).toEqual([]);
  });
});

describe("deposit rebuild", () => {
  it("counts a failed fee call as a decoy fail instead of building without the node fee", async () => {
    const { rt, sendRawTransaction } = await install({
      fee: () => Promise.reject(new Error("fee rpc down")),
    });
    const { rebuildDeposit } = await import("@/lib/services/real-sdk/intent-drain");
    const { enqueueAuto } = await import("@/lib/services/real-sdk/send-intent");

    const row = enqueueAuto(rt, { kind: "deposit", amount: 1, durationMonths: 1 }, "decoy");

    expect(await rebuildDeposit(rt, row)).toBe("decoy");
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });
});
