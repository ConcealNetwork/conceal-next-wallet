// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockWalletInfo } from "@/lib/mock-data/wallet";
import {
  _armMockSend,
  _failMockRebuild,
  _listMockIntents,
  _resetMockIntents,
  _seeMockHash,
  mockTransactionService,
} from "@/lib/services/mock/transaction.service";
import type { SdkRuntime } from "@/lib/services/real-sdk/runtime-registry";
import { enqueueAuto, noteDecoyFail, noteSubmitFail } from "@/lib/services/real-sdk/send-intent";
import { ccxToNumber } from "@/lib/utils";

const PAY = { address: "ccx7mockaddress", amount: 1 };

function probeCap(cause: "decoy" | "submit"): number {
  const rt = {} as SdkRuntime;
  const probe = enqueueAuto(rt, { address: "ccx7probeCap", amount: 1 }, cause);
  const note = cause === "decoy" ? noteDecoyFail : noteSubmitFail;
  let cap = cause === "decoy" ? probe.decoyFails : probe.submitFails;
  while (note(rt, probe.id) === "kept") {
    cap += 1;
  }
  return cap + 1;
}

async function flush<T>(work: Promise<T>): Promise<T> {
  work.catch(() => undefined);
  await vi.runAllTimersAsync();
  return work;
}

function sendPay(amount = PAY.amount) {
  return flush(mockTransactionService.sendTransaction({ address: PAY.address, amount }));
}

function listQueue() {
  return flush(mockTransactionService.listQueuedTransactions());
}

function cancelQueue(id: string) {
  return flush(mockTransactionService.cancelQueuedTransaction(id));
}

function submitHung(id: string) {
  return flush(mockTransactionService.submitHungIntent(id));
}

describe("mock send intents", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    _resetMockIntents();
    vi.useRealTimers();
  });

  it("default send succeeds and leaves the queue empty", async () => {
    const sent = await sendPay();
    expect(sent.type).toBe("send");
    expect(await listQueue()).toEqual([]);
    expect(_listMockIntents()).toEqual([]);
  });

  it("armed decoy resolves with one auto row and decoyFails 1", async () => {
    _armMockSend("decoy");
    const sent = await sendPay();
    expect(sent.type).toBe("send");

    const queued = await listQueue();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.kind).toBe("auto");
    expect(queued[0]?.hash).toBeUndefined();
    expect(queued[0]?.state).toBe("pending");

    const raw = _listMockIntents();
    expect(raw).toHaveLength(1);
    expect(raw[0]?.id).toBe(queued[0]?.id);
    expect(raw[0]?.decoyFails).toBe(1);
    expect(raw[0]?.submitFails).toBe(0);
    expect(raw[0]?.waitTicks).toBe(2);
  });

  it("armed submit resolves with one auto row and submitFails 1", async () => {
    _armMockSend("submit");
    const sent = await sendPay();
    expect(sent.type).toBe("send");

    const queued = await listQueue();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.kind).toBe("auto");
    expect(queued[0]?.hash).toBeUndefined();

    const raw = _listMockIntents();
    expect(raw).toHaveLength(1);
    expect(raw[0]?.id).toBe(queued[0]?.id);
    expect(raw[0]?.decoyFails).toBe(0);
    expect(raw[0]?.submitFails).toBe(1);
    expect(raw[0]?.waitTicks).toBe(2);
  });

  it("armed hung resolves with a watched hash and no signed blob", async () => {
    _armMockSend("hung");
    const sent = await sendPay();
    expect(sent.type).toBe("send");

    const queued = await listQueue();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.kind).toBe("hung");
    expect(queued[0]?.state).toBe("hung");
    expect(queued[0]?.hash).toEqual(expect.any(String));
    expect(queued[0]?.hash?.length).toBeGreaterThan(0);
    expect(queued[0]).not.toHaveProperty("hex");
    expect(queued[0]).not.toHaveProperty("serialized");
    expect(queued[0]).not.toHaveProperty("raw");

    const raw = _listMockIntents();
    expect(raw[0]?.kind).toBe("hung");
    expect(raw[0]?.watchedHash).toBe(queued[0]?.hash);
    expect(raw[0]).not.toHaveProperty("hex");
    expect(raw[0]).not.toHaveProperty("serialized");
    expect(raw[0]).not.toHaveProperty("raw");
  });

  it("unfunded or over-available send throws and does not enqueue", async () => {
    const available = ccxToNumber(mockWalletInfo.available);

    _armMockSend("unfunded");
    await expect(sendPay()).rejects.toThrow();
    expect(await listQueue()).toEqual([]);
    expect(_listMockIntents()).toEqual([]);

    await expect(sendPay(available + 1)).rejects.toThrow();
    expect(await listQueue()).toEqual([]);
    expect(_listMockIntents()).toEqual([]);
  });

  it("cancel by id removes the row and unknown id returns false", async () => {
    _armMockSend("decoy");
    await sendPay();
    const queued = await listQueue();
    const id = queued[0]?.id;
    if (!id) throw new Error("expected an armed decoy row");

    expect(await cancelQueue("intent-unknown-zz")).toBe(false);
    expect(await cancelQueue(id)).toBe(true);
    expect((await listQueue()).find((row) => row.id === id)).toBeUndefined();
    expect(_listMockIntents().map((row) => row.id)).not.toContain(id);
  });

  it("rebuild fails keep the row until the store cap drops it", async () => {
    _armMockSend("decoy");
    await sendPay();
    const decoyRow = _listMockIntents()[0];
    if (!decoyRow) throw new Error("expected decoy intent");
    const decoyLeft = probeCap("decoy") - decoyRow.decoyFails;
    expect(decoyLeft).toBeGreaterThan(0);
    for (let i = 0; i < decoyLeft - 1; i++) {
      expect(_failMockRebuild(decoyRow.id, "decoy")).toBe("kept");
    }
    expect(_listMockIntents().map((row) => row.id)).toContain(decoyRow.id);
    expect(_failMockRebuild(decoyRow.id, "decoy")).toBe("dropped");
    expect((await listQueue()).map((row) => row.id)).not.toContain(decoyRow.id);

    _armMockSend("submit");
    await sendPay();
    const submitRow = _listMockIntents()[0];
    if (!submitRow) throw new Error("expected submit intent");
    const submitLeft = probeCap("submit") - submitRow.submitFails;
    expect(submitLeft).toBeGreaterThan(0);
    for (let i = 0; i < submitLeft - 1; i++) {
      expect(_failMockRebuild(submitRow.id, "submit")).toBe("kept");
    }
    expect(_listMockIntents().map((row) => row.id)).toContain(submitRow.id);
    expect(_failMockRebuild(submitRow.id, "submit")).toBe("dropped");
    expect((await listQueue()).map((row) => row.id)).not.toContain(submitRow.id);
  });

  it("marks a hung intent sent when its watched hash is already in history", async () => {
    _armMockSend("hung");
    await sendPay();
    const hung = _listMockIntents()[0];
    if (!hung?.watchedHash) throw new Error("expected hung watchedHash");
    const firstId = hung.id;
    const firstHash = hung.watchedHash;

    _seeMockHash(firstHash);
    expect(await submitHung(firstId)).toBe(true);

    const after = _listMockIntents();
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(firstId);
    expect(after[0]?.sent).toBe(true);
    expect(after[0]?.watchedHash).toBe(firstHash);
    expect(after.filter((row) => row.kind === "hung")).toHaveLength(1);
  });

  it("rebuilds a hung intent with a new watched hash when history still lacks it", async () => {
    _armMockSend("hung");
    await sendPay();
    const hung = _listMockIntents()[0];
    if (!hung?.watchedHash) throw new Error("expected hung watchedHash");
    const firstId = hung.id;
    const firstHash = hung.watchedHash;

    _armMockSend("hung");
    expect(await submitHung(firstId)).toBe(true);

    const after = _listMockIntents();
    const rebuilt = after.find((row) => row.id === firstId);
    expect(rebuilt?.kind).toBe("hung");
    expect(rebuilt?.watchedHash).toEqual(expect.any(String));
    expect(rebuilt?.watchedHash).not.toBe(firstHash);
    expect(after.filter((row) => row.kind === "hung")).toHaveLength(1);
  });

  it("drops the hung row when Submit rebuilds successfully", async () => {
    _armMockSend("hung");
    await sendPay();
    const hung = _listMockIntents()[0];
    if (!hung) throw new Error("expected hung intent");
    const hungId = hung.id;

    expect(await submitHung(hungId)).toBe(true);
    expect(_listMockIntents().map((row) => row.id)).not.toContain(hungId);
    expect(await listQueue()).toEqual([]);
  });

  it("reset after enqueue empties the list", async () => {
    _armMockSend("decoy");
    await sendPay();
    expect(_listMockIntents().length).toBeGreaterThan(0);
    _resetMockIntents();
    expect(await listQueue()).toEqual([]);
    expect(_listMockIntents()).toEqual([]);
  });
});
