// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockWalletInfo } from "@/lib/mock-data/wallet";
import {
  _armMockDeposit,
  _disarmMockDeposit,
  mockDepositService,
} from "@/lib/services/mock/deposit.service";
import {
  _armMockMessage,
  _disarmMockMessage,
  mockMessageService,
} from "@/lib/services/mock/message.service";
import {
  _armMockFusion,
  _disarmMockFusion,
  mockSettingsService,
} from "@/lib/services/mock/settings.service";
import {
  _listMockIntents,
  _resetMockIntents,
  mockTransactionService,
} from "@/lib/services/mock/transaction.service";
import type { SdkRuntime } from "@/lib/services/real-sdk/runtime-registry";
import { clearIntents } from "@/lib/services/real-sdk/send-intent";
import { ccxToNumber } from "@/lib/utils";

const RECIPIENT = "ccx7queuedMockRecipientAddress";

async function flush<T>(work: Promise<T>): Promise<T> {
  work.catch(() => undefined);
  await vi.runAllTimersAsync();
  return work;
}

function listQueue() {
  return flush(mockTransactionService.listQueuedTransactions());
}

function park(scope: "deposit" | "message" | "fusion", kind: "decoy" | "hung"): void {
  if (scope === "deposit") _armMockDeposit(kind);
  else if (scope === "message") _armMockMessage(kind);
  else _armMockFusion(kind);
}

describe("mock parked intents for deposit / message / fusion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    _resetMockIntents();
    _disarmMockDeposit();
    _disarmMockMessage();
    _disarmMockFusion();
    clearIntents({} as SdkRuntime);
    vi.useRealTimers();
  });

  it("createDeposit parks an auto intent and returns a queued deposit", async () => {
    park("deposit", "decoy");
    const deposit = await flush(mockDepositService.createDeposit({ amount: 3, durationMonths: 6 }));
    expect(deposit.queued).toBe("auto");
    expect(deposit.txHash).not.toBe("mock-deposit-tx-hash");

    const queued = await listQueue();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.kind).toBe("auto");
    expect(queued[0]?.intentKind).toBe("deposit");
    expect(_listMockIntents()[0]?.kind).toBe("deposit");
    expect(_listMockIntents()[0]?.payload).toEqual({ amount: 3, durationMonths: 6 });
  });

  it("withdrawDeposit parks a hung intent and returns a queued withdrawal", async () => {
    park("deposit", "hung");
    const tx = await flush(
      mockDepositService.withdrawDeposit({ txHash: "mock-dep", globalOutputIndex: 1 }),
    );
    expect(tx.queued).toBe("hung");
    expect(tx.type).toBe("withdrawal");
    expect(_listMockIntents()[0]?.state).toBe("hung");
    expect(_listMockIntents()[0]?.kind).toBe("withdraw");
    expect(_listMockIntents()[0]?.watchedHash).toBe(tx.hash);
  });

  it("sendMessage parks an auto intent and returns a queued Message", async () => {
    park("message", "decoy");
    const sent = await flush(
      mockMessageService.sendMessage({ recipientAddress: RECIPIENT, body: "hold" }),
    );
    expect(sent.queued).toBe("auto");
    const queued = await listQueue();
    expect(queued[0]?.intentKind).toBe("message");
    expect(queued[0]?.label).toContain("Message to");
  });

  it("optimizeWallet parks a fusion intent and returns a queued result", async () => {
    park("fusion", "decoy");
    const result = await flush(mockSettingsService.optimizeWallet());
    expect(result.optimized).toBe(false);
    expect(result.queued).toBe("auto");
    expect(_listMockIntents()[0]?.kind).toBe("fusion");
  });

  it("parked rows are cancellable through the shared queue and defaults stay clean", async () => {
    park("deposit", "decoy");
    const deposit = await flush(mockDepositService.createDeposit({ amount: 3, durationMonths: 6 }));
    const queued = await listQueue();
    const id = queued[0]?.id;
    if (!id) throw new Error("expected a parked deposit row");
    expect(await flush(mockTransactionService.cancelQueuedTransaction(id))).toBe(true);
    expect(await listQueue()).toEqual([]);
    expect(deposit.queued).toBe("auto");

    // Default (unarmed) behavior: clean success, no queued marker, empty queue.
    const clean = await flush(mockDepositService.createDeposit({ amount: 1, durationMonths: 3 }));
    expect(clean.queued).toBeUndefined();
    expect(clean.txHash).toBe("mock-deposit-tx-hash");
  });

  it("an over-available deposit still throws instead of parking", async () => {
    const available = ccxToNumber(mockWalletInfo.available);
    park("deposit", "decoy");
    await expect(
      flush(mockDepositService.createDeposit({ amount: available + 1, durationMonths: 3 })),
    ).rejects.toThrow();
  });
});
