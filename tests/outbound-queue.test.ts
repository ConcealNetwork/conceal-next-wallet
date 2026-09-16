import {
  createMemoryStorage,
  createOutboundQueue,
  type transactions as txns,
} from "conceal-wallet-sdk";
import { afterEach, describe, expect, it } from "vitest";
import {
  _armMockSend,
  _resetMockIntents,
  mockTransactionService,
} from "@/lib/services/mock/transaction.service";
import { mapQueuedTransaction } from "@/lib/services/real-sdk/mappers";
import { queueForRuntime } from "@/lib/services/real-sdk/outbound-queue";
import type { QueuedTransaction } from "@/lib/types";

/**
 * Durable outbound queue (#92): the pure UI mapper, the mock service surface, and a direct
 * lifecycle exercise of the SDK queue with the app's config + usage (enqueue reserves
 * inputs; drain broadcasts on success and retries on transient failure; cancel frees).
 */

// The queue only reads hash / serialized / inputs[].keyImage off a built tx.
function fakeBuilt(hash: string, keyImage: string): txns.BuiltTransaction {
  return {
    hash,
    serialized: `${hash}-blob`,
    inputs: [{ keyImage }],
  } as unknown as txns.BuiltTransaction;
}

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

describe("mapQueuedTransaction", () => {
  it("maps required fields and omits absent optionals", () => {
    const mapped = mapQueuedTransaction({
      id: "h1",
      hash: "h1",
      serialized: "blob",
      keyImages: ["ki1"],
      enqueuedAt: 1000,
      state: "pending",
      attempts: 0,
    });
    expect(mapped).toEqual({
      id: "h1",
      hash: "h1",
      state: "pending",
      attempts: 0,
      enqueuedAt: 1000,
    });
  });

  it("carries label / lastError / failedReason when present", () => {
    const mapped = mapQueuedTransaction({
      id: "h2",
      hash: "h2",
      serialized: "blob",
      keyImages: [],
      enqueuedAt: 2000,
      state: "failed",
      attempts: 3,
      label: "Send 5 CCX",
      lastError: "relay refused",
      failedReason: "rejected",
    });
    expect(mapped).toMatchObject({
      state: "failed",
      attempts: 3,
      label: "Send 5 CCX",
      lastError: "relay refused",
      failedReason: "rejected",
    });
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

describe("outbound queue lifecycle (app config + usage)", () => {
  it("reserves inputs on enqueue and broadcasts a due entry on drain", async () => {
    let ok = true;
    const queue = createOutboundQueue({
      storage: createMemoryStorage(),
      daemon: {
        sendRawTransaction: () =>
          ok ? Promise.resolve({ status: "OK" }) : Promise.reject(new Error("relay refused")),
      } as never,
      maxAttempts: 5,
    });

    await queue.enqueue(fakeBuilt("aa", "ki-a"));
    expect((await queue.list()).map((e) => e.state)).toEqual(["pending"]);
    expect(await queue.reservedKeyImages()).toEqual(new Set(["ki-a"]));

    const results = await queue.drainOnce();
    expect(results[0].state).toBe("broadcast");
    expect((await queue.list())[0].state).toBe("broadcast");

    // A transient failure keeps the entry pending (retried later), not lost.
    ok = false;
    await queue.enqueue(fakeBuilt("bb", "ki-b"));
    await queue.drainOnce();
    const bb = (await queue.list()).find((e) => e.hash === "bb");
    expect(bb?.state).toBe("pending");
    expect(bb?.attempts).toBeGreaterThanOrEqual(1);
  });

  it("cancel removes a pending entry and frees its reserved inputs", async () => {
    const queue = createOutboundQueue({
      storage: createMemoryStorage(),
      daemon: { sendRawTransaction: () => Promise.resolve({ status: "OK" }) } as never,
    });
    const id = await queue.enqueue(fakeBuilt("cc", "ki-c"));
    expect(await queue.reservedKeyImages()).toEqual(new Set(["ki-c"]));
    expect(await queue.cancel(id)).toBe(true);
    expect(await queue.list()).toEqual([]);
    expect(await queue.reservedKeyImages()).toEqual(new Set());
  });
});

describe("queueForRuntime wrapper (#92 review — serialization)", () => {
  it("delegates + caches per runtime, and serializes concurrent drains", async () => {
    let inFlight = 0;
    let maxConcurrent = 0;
    const daemon = {
      sendRawTransaction: async () => {
        inFlight += 1;
        maxConcurrent = Math.max(maxConcurrent, inFlight);
        await Promise.resolve(); // yield so an unserialized peer could interleave
        inFlight -= 1;
        return { status: "OK" };
      },
    };
    const rt = { storage: createMemoryStorage(), daemon } as unknown as Parameters<
      typeof queueForRuntime
    >[0];

    const queue = queueForRuntime(rt);
    expect(queueForRuntime(rt)).toBe(queue); // cached per runtime

    await queue.enqueue(fakeBuilt("d1", "ki-d1"));
    await queue.enqueue(fakeBuilt("d2", "ki-d2"));
    // Fire two drains concurrently — the per-queue chain must run them one at a time.
    await Promise.all([queue.drainOnce(), queue.drainOnce()]);
    expect(maxConcurrent).toBe(1);
    expect((await queue.list()).every((e) => e.state === "broadcast")).toBe(true);
  });
});
