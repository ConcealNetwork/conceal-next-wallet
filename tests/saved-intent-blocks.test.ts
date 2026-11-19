// @vitest-environment node

// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { createAccount, createWalletState, init } from "conceal-wallet-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockDeposits } from "@/lib/mock-data/wallet";
import { mockDepositService } from "@/lib/services/mock/deposit.service";
import { mockSettingsService } from "@/lib/services/mock/settings.service";
import { mockIntentRuntime } from "@/lib/services/mock/transaction.service";
import type { SdkRuntime } from "@/lib/services/real-sdk/runtime-registry";
import {
  cancelIntent,
  clearIntents,
  enqueueAuto,
  enqueueHung,
  fusionSaved,
  listIntents,
  markHungSent,
  noteDecoyFail,
  savedWithdrawKeys,
} from "@/lib/services/real-sdk/send-intent";

const DEPOSIT_HASH = "ab".repeat(32);

async function installReal() {
  await init();
  const alice = createAccount("english");
  const getHeight = vi.fn(() => Promise.resolve(100_000));
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
      scannedHeight: 100_000,
      deposits: [
        {
          amount: 1_000_000,
          globalIndex: 7,
          outputIndex: 0,
          txPublicKey: "",
          publicKey: "",
          keys: [],
          term: 21_900,
          blockHeight: 10,
          txHash: DEPOSIT_HASH,
          interest: 0,
          unlockHeight: 21_910,
        },
      ],
    },
    daemon: {
      nodeUrl: "https://node.test/",
      getHeight,
      getNodeFeeAddress: () => Promise.resolve(""),
      sendRawTransaction: () => Promise.resolve({ status: "OK" }),
      getRandomOuts: () => Promise.resolve([]),
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
  return { rt };
}

afterEach(async () => {
  clearIntents(mockIntentRuntime);
  const { getRuntime } = await import("@/lib/services/real-sdk/runtime");
  const rt = getRuntime();
  if (rt) clearIntents(rt);
});

describe("saved intent lookups", () => {
  it("lists withdraw targets and a saved fusion, ignoring a hung row already sent", () => {
    const rt = {} as SdkRuntime;
    enqueueAuto(rt, { kind: "withdraw", txHash: "d1", globalOutputIndex: 2 }, "decoy");
    const hung = enqueueHung(rt, { kind: "fusion" }, "fusion-hash");

    expect(savedWithdrawKeys(rt)).toEqual(new Set(["d1:2"]));
    expect(fusionSaved(rt)).toBe(true);

    markHungSent(rt, hung.id);
    expect(fusionSaved(rt)).toBe(false);
  });
});

describe("mock: a saved intent blocks a second one", () => {
  it("marks the deposit withdrawing and refuses a second withdraw", async () => {
    const target = mockDeposits.find((deposit) => deposit.status === "unlocked") ?? mockDeposits[0];
    if (!target) throw new Error("mock deposit missing");
    enqueueAuto(
      mockIntentRuntime,
      { kind: "withdraw", txHash: target.txHash, globalOutputIndex: target.globalOutputIndex },
      "decoy",
    );

    const listed = await mockDepositService.listDeposits();
    expect(listed.find((deposit) => deposit.id === target.id)?.withdrawPending).toBe(true);
    await expect(
      mockDepositService.withdrawDeposit({
        txHash: target.txHash,
        globalOutputIndex: target.globalOutputIndex,
      }),
    ).rejects.toThrow(/already pending/);

    const row = listIntents(mockIntentRuntime)[0];
    if (!row) throw new Error("intent missing");
    let note = noteDecoyFail(mockIntentRuntime, row.id);
    while (note !== "dropped") note = noteDecoyFail(mockIntentRuntime, row.id);

    const after = await mockDepositService.listDeposits();
    expect(after.find((deposit) => deposit.id === target.id)?.withdrawPending).toBeFalsy();
  });

  it("reports a saved fusion and refuses a second optimize", async () => {
    enqueueAuto(mockIntentRuntime, { kind: "fusion" }, "decoy");

    expect(await mockSettingsService.getOptimizationStatus()).toMatchObject({
      isNeeded: false,
      intentSaved: true,
    });
    await expect(mockSettingsService.optimizeWallet()).rejects.toThrow(/already saved/);
  });
});

describe("real: a saved intent blocks a second one", () => {
  it("marks the deposit withdrawing and refuses a second withdraw", async () => {
    const { rt } = await installReal();
    const { realSdkDepositService } = await import("@/lib/services/real-sdk/deposit.service");
    enqueueAuto(rt, { kind: "withdraw", txHash: DEPOSIT_HASH, globalOutputIndex: 7 }, "decoy");

    const listed = await realSdkDepositService.listDeposits();
    expect(listed.find((deposit) => deposit.txHash === DEPOSIT_HASH)?.withdrawPending).toBe(true);
    await expect(
      realSdkDepositService.withdrawDeposit({ txHash: DEPOSIT_HASH, globalOutputIndex: 7 }),
    ).rejects.toThrow(/already pending/);
  });

  it("lists the deposit as withdrawable again once the intent is dropped after the decoy cap", async () => {
    const { rt } = await installReal();
    const { realSdkDepositService } = await import("@/lib/services/real-sdk/deposit.service");
    const row = enqueueAuto(
      rt,
      { kind: "withdraw", txHash: DEPOSIT_HASH, globalOutputIndex: 7 },
      "decoy",
    );

    let note = noteDecoyFail(rt, row.id);
    while (note !== "dropped") note = noteDecoyFail(rt, row.id);

    const listed = await realSdkDepositService.listDeposits();
    const deposit = listed.find((entry) => entry.txHash === DEPOSIT_HASH);
    expect(deposit?.status).toBe("unlocked");
    expect(deposit?.withdrawPending).toBeUndefined();
  });

  it("lists the deposit as withdrawable again once the intent is cancelled", async () => {
    const { rt } = await installReal();
    const { realSdkDepositService } = await import("@/lib/services/real-sdk/deposit.service");
    const row = enqueueAuto(
      rt,
      { kind: "withdraw", txHash: DEPOSIT_HASH, globalOutputIndex: 7 },
      "decoy",
    );

    cancelIntent(rt, row.id);

    const listed = await realSdkDepositService.listDeposits();
    expect(listed.find((entry) => entry.txHash === DEPOSIT_HASH)?.withdrawPending).toBeUndefined();
  });

  it("reports a saved fusion and refuses a second optimize", async () => {
    const { rt } = await installReal();
    const { realSdkSettingsService } = await import("@/lib/services/real-sdk/settings.service");
    enqueueAuto(rt, { kind: "fusion" }, "decoy");

    expect(await realSdkSettingsService.getOptimizationStatus()).toMatchObject({
      isNeeded: false,
      intentSaved: true,
    });
    await expect(realSdkSettingsService.optimizeWallet()).rejects.toThrow(/already saved/);
  });
});
