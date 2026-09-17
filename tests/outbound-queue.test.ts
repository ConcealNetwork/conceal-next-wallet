// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { afterEach, describe, expect, it } from "vitest";
import {
  _armMockSend,
  _resetMockIntents,
  mockTransactionService,
} from "@/lib/services/mock/transaction.service";
import type { QueuedTransaction } from "@/lib/types";

describe("QueuedTransaction intent shape", () => {
  it("allows an auto intent with no hash", () => {
    const row: QueuedTransaction = {
      id: "intent-1",
      kind: "auto",
      state: "pending",
      attempts: 0,
      enqueuedAt: 1,
    };
    expect(row.hash).toBeUndefined();
    expect(row.kind).toBe("auto");
    expect(row.id).toBe("intent-1");
  });

  it("allows a hung intent with watched hash and sent", () => {
    const row: QueuedTransaction = {
      id: "intent-2",
      hash: "watched-hash",
      kind: "hung",
      sent: false,
      state: "hung",
      attempts: 0,
      enqueuedAt: 2,
    };
    expect(row.hash).toBe("watched-hash");
    expect(row.state).toBe("hung");
    expect(row.sent).toBe(false);
  });
});

describe("mock transaction queue", () => {
  afterEach(() => {
    _resetMockIntents();
  });

  it("cancels an armed intent by id and reports false for an unknown id", async () => {
    _armMockSend("decoy");
    await mockTransactionService.sendTransaction({ address: "ccx7mockaddress", amount: 1 });
    const before = await mockTransactionService.listQueuedTransactions();
    expect(before).toHaveLength(1);
    expect(await mockTransactionService.cancelQueuedTransaction("does-not-exist")).toBe(false);
    expect(await mockTransactionService.cancelQueuedTransaction(before[0].id)).toBe(true);
    const after = await mockTransactionService.listQueuedTransactions();
    expect(after.find((e) => e.id === before[0].id)).toBeUndefined();
  });
});
