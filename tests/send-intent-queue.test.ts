// @vitest-environment node

// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { describe, expect, it } from "vitest";
import type { SdkRuntime } from "@/lib/services/real-sdk/runtime-registry";
import {
  cancelIntent,
  clearIntents,
  dropUnfunded,
  dueAutoIntents,
  enqueueAuto,
  enqueueHung,
  listIntents,
  markHungSent,
  noteDecoyFail,
  noteSubmitFail,
  takeDropToast,
  tickSynced,
} from "@/lib/services/real-sdk/send-intent";
import { queueCopy } from "@/lib/ui/queue-copy";

function fakeRuntime(): SdkRuntime {
  return {} as SdkRuntime;
}

function payInput(
  address: string,
  amount: number,
  extra: { paymentId?: string; message?: string } = {},
) {
  return { address, amount, ...extra };
}

function dueIds(rt: SdkRuntime): string[] {
  return dueAutoIntents(rt).map((row) => row.id);
}

describe("send intent store", () => {
  it("lists an auto decoy enqueue with decoyFails 1 and waitTicks 2", () => {
    const rt = fakeRuntime();
    const input = payInput("ccx7decoyPay", 1_100_000, {
      paymentId: "pid-decoy-aa",
      message: "decoy retry",
    });

    const queued = enqueueAuto(rt, input, "decoy");
    const listed = listIntents(rt);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(queued.id);
    expect(listed[0]).toMatchObject({
      address: input.address,
      amount: input.amount,
      paymentId: input.paymentId,
      message: input.message,
      kind: "auto",
      decoyFails: 1,
      submitFails: 0,
      waitTicks: 2,
    });
  });

  it("lists an auto submit enqueue with submitFails 1 and waitTicks 2", () => {
    const rt = fakeRuntime();
    const input = payInput("ccx7submitPay", 2_200_000, {
      paymentId: "pid-submit-bb",
    });

    const queued = enqueueAuto(rt, input, "submit");
    const listed = listIntents(rt);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(queued.id);
    expect(listed[0]).toMatchObject({
      address: input.address,
      amount: input.amount,
      paymentId: input.paymentId,
      kind: "auto",
      decoyFails: 0,
      submitFails: 1,
      waitTicks: 2,
    });
  });

  it("keeps hung intents out of dueAutoIntents after more ticks than an auto wait", () => {
    const rt = fakeRuntime();
    const input = payInput("ccx7hungWatch", 3_300_000);
    const watchedHash = "hash-hung-aa";
    const queued = enqueueHung(rt, input, watchedHash);

    expect(queued.kind).toBe("hung");
    expect(queued.watchedHash).toBe(watchedHash);
    expect(queued).not.toHaveProperty("hex");
    expect(queued).not.toHaveProperty("serialized");
    expect(queued).not.toHaveProperty("raw");
    expect(listIntents(rt)[0]?.watchedHash).toBe(watchedHash);

    const sampleWait = enqueueAuto(
      fakeRuntime(),
      payInput("ccx7waitProbe", 111_000),
      "decoy",
    ).waitTicks;
    for (let i = 0; i < sampleWait * 3; i++) {
      tickSynced(rt);
    }

    expect(dueIds(rt)).not.toContain(queued.id);
    expect(dueAutoIntents(rt)).toEqual([]);
  });

  it("makes an auto intent due only after its remaining waitTicks", () => {
    const rt = fakeRuntime();
    const input = payInput("ccx7tickWait", 4_400_000);
    const queued = enqueueAuto(rt, input, "decoy");
    const ticksLeft = queued.waitTicks;
    expect(ticksLeft).toBeGreaterThan(0);

    for (let i = 0; i < ticksLeft - 1; i++) {
      tickSynced(rt);
    }
    expect(dueIds(rt)).not.toContain(queued.id);

    tickSynced(rt);
    expect(dueIds(rt)).toContain(queued.id);
  });

  it("dropUnfunded removes when spendable is below need and keeps when funded", () => {
    const rt = fakeRuntime();
    const shortNeed = 5_500_000;
    const shortHave = 5_499_999;
    const fundedNeed = 6_600_000;
    const fundedHave = 6_600_000;
    const short = enqueueAuto(rt, payInput("ccx7shortFund", shortNeed), "decoy");
    const funded = enqueueAuto(rt, payInput("ccx7keepFund", fundedNeed), "submit");

    expect(shortHave < shortNeed).toBe(true);
    expect(dropUnfunded(rt, short.id, shortHave, shortNeed)).toBe(true);
    expect(listIntents(rt).map((row) => row.id)).not.toContain(short.id);

    expect(fundedHave >= fundedNeed).toBe(true);
    expect(dropUnfunded(rt, funded.id, fundedHave, fundedNeed)).toBe(false);
    expect(listIntents(rt).map((row) => row.id)).toContain(funded.id);
  });

  it("drops an auto decoy intent when decoyFails reaches the connect cap", () => {
    const rt = fakeRuntime();
    const decoyCap = 5;
    const queued = enqueueAuto(rt, payInput("ccx7decoyCap", 7_700_000), "decoy");
    const listed = listIntents(rt).find((row) => row.id === queued.id);
    if (!listed) {
      throw new Error("decoy enqueue missing from list");
    }
    const failsLeft = decoyCap - listed.decoyFails;
    expect(failsLeft).toBeGreaterThan(0);

    for (let i = 0; i < failsLeft - 1; i++) {
      expect(noteDecoyFail(rt, queued.id)).toBe("kept");
    }
    expect(listIntents(rt).map((row) => row.id)).toContain(queued.id);
    expect(noteDecoyFail(rt, queued.id)).toBe("dropped");
    expect(listIntents(rt).map((row) => row.id)).not.toContain(queued.id);
  });

  it("drops an auto submit intent when submitFails reaches the submit cap", () => {
    const rt = fakeRuntime();
    const submitCap = 3;
    const queued = enqueueAuto(rt, payInput("ccx7submitCap", 8_800_000), "submit");
    const listed = listIntents(rt).find((row) => row.id === queued.id);
    if (!listed) {
      throw new Error("submit enqueue missing from list");
    }
    const failsLeft = submitCap - listed.submitFails;
    expect(failsLeft).toBeGreaterThan(0);

    for (let i = 0; i < failsLeft - 1; i++) {
      expect(noteSubmitFail(rt, queued.id)).toBe("kept");
    }
    expect(listIntents(rt).map((row) => row.id)).toContain(queued.id);
    expect(noteSubmitFail(rt, queued.id)).toBe("dropped");
    expect(listIntents(rt).map((row) => row.id)).not.toContain(queued.id);
  });

  it("clearIntents empties the runtime list (lock or delete)", () => {
    const rt = fakeRuntime();
    enqueueAuto(rt, payInput("ccx7lockAuto", 9_900_000), "decoy");
    enqueueHung(rt, payInput("ccx7lockHung", 10_100_000), "hash-lock-cc");

    expect(listIntents(rt).length).toBeGreaterThan(0);
    clearIntents(rt);
    expect(listIntents(rt)).toEqual([]);
  });

  it("cancelIntent removes a known id and returns false for an unknown id", () => {
    const rt = fakeRuntime();
    const queued = enqueueAuto(rt, payInput("ccx7cancelRow", 11_200_000), "decoy");

    expect(cancelIntent(rt, queued.id)).toBe(true);
    expect(listIntents(rt).map((row) => row.id)).not.toContain(queued.id);
    expect(cancelIntent(rt, "intent-unknown-zz")).toBe(false);
  });

  it("markHungSent sets sent and still excludes the hung row from dueAutoIntents", () => {
    const rt = fakeRuntime();
    const queued = enqueueHung(rt, payInput("ccx7hungSent", 12_300_000), "hash-sent-dd");

    markHungSent(rt, queued.id);
    const listed = listIntents(rt).find((row) => row.id === queued.id);
    expect(listed?.sent).toBe(true);
    expect(dueIds(rt)).not.toContain(queued.id);
  });

  it("lists an enqueue only on the storing runtime", () => {
    const rtA = fakeRuntime();
    const rtB = fakeRuntime();
    const queued = enqueueAuto(rtA, payInput("ccx7isoPay", 13_400_000), "decoy");

    expect(listIntents(rtB)).toEqual([]);
    expect(listIntents(rtA).map((row) => row.id)).toContain(queued.id);
  });

  it("queues the English exhaust toast on cap drop and not on unfunded drop", () => {
    const rt = fakeRuntime();
    const submitCap = 3;
    const queued = enqueueAuto(rt, payInput("ccx7toastCap", 8_800_000), "submit");
    const listed = listIntents(rt).find((row) => row.id === queued.id);
    if (!listed) {
      throw new Error("submit enqueue missing from list");
    }
    const failsLeft = submitCap - listed.submitFails;
    expect(failsLeft).toBeGreaterThan(0);
    for (let i = 0; i < failsLeft - 1; i++) {
      expect(noteSubmitFail(rt, queued.id)).toBe("kept");
    }
    expect(noteSubmitFail(rt, queued.id)).toBe("dropped");
    expect(takeDropToast(rt)).toBe(queueCopy.exhaustToast);
    expect(takeDropToast(rt)).toBeUndefined();

    const shortNeed = 5_500_000;
    const shortHave = 5_499_999;
    const short = enqueueAuto(rt, payInput("ccx7toastFund", shortNeed), "decoy");
    expect(dropUnfunded(rt, short.id, shortHave, shortNeed)).toBe(true);
    expect(takeDropToast(rt)).toBeUndefined();

    const decoyCap = 5;
    const decoy = enqueueAuto(rt, payInput("ccx7toastDecoy", 7_700_000), "decoy");
    const decoyListed = listIntents(rt).find((row) => row.id === decoy.id);
    if (!decoyListed) {
      throw new Error("decoy enqueue missing from list");
    }
    const decoyLeft = decoyCap - decoyListed.decoyFails;
    expect(decoyLeft).toBeGreaterThan(0);
    for (let i = 0; i < decoyLeft - 1; i++) {
      expect(noteDecoyFail(rt, decoy.id)).toBe("kept");
    }
    expect(noteDecoyFail(rt, decoy.id)).toBe("dropped");
    clearIntents(rt);
    expect(takeDropToast(rt)).toBeUndefined();
  });

  it("scopes the drop toast to its runtime and clears it with the store", () => {
    const rtA = fakeRuntime();
    const rtB = fakeRuntime();
    const queued = enqueueAuto(rtA, payInput("ccx7toastScope", 8_800_000), "submit");
    let note: "kept" | "dropped" = "kept";
    while (note === "kept") {
      const next = noteSubmitFail(rtA, queued.id);
      note = next;
    }
    expect(note).toBe("dropped");

    expect(takeDropToast(rtB)).toBeUndefined();
    expect(takeDropToast(rtA)).toBe(queueCopy.exhaustToast);
    expect(takeDropToast(rtA)).toBeUndefined();
  });

  it("stamps enqueuedAt on the row and drops it with the row", () => {
    const rt = fakeRuntime();
    const before = Date.now();
    const queued = enqueueAuto(rt, payInput("ccx7stamp", 9_900_000), "decoy");
    expect(queued.enqueuedAt).toBeGreaterThanOrEqual(before);

    expect(cancelIntent(rt, queued.id)).toBe(true);
    expect(listIntents(rt)).toEqual([]);
  });
});
