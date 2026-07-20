import type { RawWalletV1, WalletState } from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import { isTtlExpired, ttlRefetchMs } from "@/lib/messages/ttl";
import {
  createSentMessageRecord,
  dropExpiredTtl,
  minedHeightsFromState,
  patchSentMessageBlockHeights,
  pruneExpiredTtl,
  pruneStaleMempoolReceived,
  type SdkMessageRecord,
  withSentRecords,
} from "@/lib/services/real-sdk/messages-store";
import {
  addPendingRecord,
  type PendingTxRecord,
  readPendingRecords,
} from "@/lib/services/real-sdk/pending-store";

describe("patchSentMessageBlockHeights", () => {
  it("fills blockHeight from mined wallet state for sent copies still at 0", () => {
    const sent = createSentMessageRecord({
      hash: "abc123",
      recipientAddress: "ccx7recipient",
      body: "hello",
      timestampIso: new Date().toISOString(),
    });
    expect(sent.blockHeight).toBe(0);

    const state = {
      transactions: [{ hash: "abc123", height: 2_104_857 }],
    } as unknown as WalletState;
    const heights = minedHeightsFromState(state);
    const { records, changed } = patchSentMessageBlockHeights([sent], heights);
    expect(changed).toBe(true);
    expect(records[0].blockHeight).toBe(2_104_857);
  });

  it("leaves already-confirmed rows untouched", () => {
    const sent: SdkMessageRecord = {
      ...createSentMessageRecord({
        hash: "abc123",
        recipientAddress: "ccx7recipient",
        body: "hello",
        timestampIso: new Date().toISOString(),
      }),
      blockHeight: 99,
    };
    const state = {
      transactions: [{ hash: "abc123", height: 2_104_857 }],
    } as unknown as WalletState;
    const { records, changed } = patchSentMessageBlockHeights([sent], minedHeightsFromState(state));
    expect(changed).toBe(false);
    expect(records[0].blockHeight).toBe(99);
  });
});

describe("pruneStaleMempoolReceived", () => {
  it("drops 0-conf rows no longer in the mempool and not mined", () => {
    const row: SdkMessageRecord = {
      id: "gone",
      direction: "received",
      counterpartyAddress: "",
      counterpartyName: "x",
      body: "hi",
      hasBody: true,
      sentTo: null,
      paymentIdFrom: null,
      paymentIdTo: null,
      timestamp: new Date().toISOString(),
      unread: true,
      blockHeight: 0,
      threadKey: "gone",
    };
    const kept = pruneStaleMempoolReceived([row], new Set(["other"]), new Set());
    expect(kept).toEqual([]);
  });

  it("keeps active mempool and mined rows", () => {
    const mempool: SdkMessageRecord = {
      id: "pool",
      direction: "received",
      counterpartyAddress: "",
      counterpartyName: "x",
      body: "hi",
      hasBody: true,
      sentTo: null,
      paymentIdFrom: null,
      paymentIdTo: null,
      timestamp: new Date().toISOString(),
      unread: true,
      blockHeight: 0,
      threadKey: "pool",
    };
    const mined: SdkMessageRecord = { ...mempool, id: "mined", blockHeight: 50 };
    expect(pruneStaleMempoolReceived([mempool], new Set(["pool"]), new Set())).toEqual([mempool]);
    expect(pruneStaleMempoolReceived([mempool], new Set(), new Set(["pool"]))).toEqual([mempool]);
    expect(pruneStaleMempoolReceived([mined], new Set(), new Set())).toEqual([mined]);
  });
});

describe("pruneExpiredTtl / dropExpiredTtl", () => {
  const nowUnix = 1_700_000_000;

  it("isTtlExpired is true at/after expiry", () => {
    expect(isTtlExpired(nowUnix - 1, nowUnix)).toBe(true);
    expect(isTtlExpired(nowUnix, nowUnix)).toBe(true);
    expect(isTtlExpired(nowUnix + 1, nowUnix)).toBe(false);
    expect(isTtlExpired(undefined, nowUnix)).toBe(false);
  });

  it("drops only expired 0-conf rows; keeps mined and live TTL", () => {
    const expired = createSentMessageRecord({
      hash: "expired",
      recipientAddress: "ccx7a",
      body: "bye",
      timestampIso: new Date().toISOString(),
      ttlExpiresAt: nowUnix - 10,
    });
    const live = createSentMessageRecord({
      hash: "live",
      recipientAddress: "ccx7b",
      body: "hi",
      timestampIso: new Date().toISOString(),
      ttlExpiresAt: nowUnix + 60,
    });
    const mined: SdkMessageRecord = {
      ...createSentMessageRecord({
        hash: "mined",
        recipientAddress: "ccx7c",
        body: "kept",
        timestampIso: new Date().toISOString(),
        ttlExpiresAt: nowUnix - 10,
      }),
      blockHeight: 42,
    };
    const kept = pruneExpiredTtl([expired, live, mined], nowUnix);
    expect(kept.map((r) => r.id)).toEqual(["live", "mined"]);
  });

  it("dropExpiredTtl also removes matching pending tx rows", () => {
    const expired = createSentMessageRecord({
      hash: "ttl-hash",
      recipientAddress: "ccx7a",
      body: "bye",
      timestampIso: new Date().toISOString(),
      ttlExpiresAt: nowUnix - 5,
    });
    let raw = withSentRecords({} as RawWalletV1, [expired]);
    raw = addPendingRecord(raw, {
      hash: "ttl-hash",
      type: "message",
      amountAtomic: 100,
      timestampIso: new Date().toISOString(),
      address: "ccx7a",
      spentKeyImages: ["ki"],
      ttlExpiresAt: nowUnix - 5,
    });
    raw = addPendingRecord(raw, {
      hash: "keep-hash",
      amountAtomic: 500,
      timestampIso: new Date().toISOString(),
      address: "ccx7b",
      spentKeyImages: ["ki2"],
    });

    const { raw: next, changed } = dropExpiredTtl(raw, nowUnix);
    expect(changed).toBe(true);
    expect(readPendingRecords(next).map((r) => r.hash)).toEqual(["keep-hash"]);
    const { raw: again, changed: againChanged } = dropExpiredTtl(next, nowUnix);
    expect(againChanged).toBe(false);
    expect(again).toBe(next);
  });

  it("prunes pending by its own ttlExpiresAt even without a message row", () => {
    const pending: PendingTxRecord = {
      hash: "orphan-ttl",
      type: "message",
      amountAtomic: 100,
      timestampIso: new Date().toISOString(),
      address: "ccx7a",
      spentKeyImages: ["ki"],
      ttlExpiresAt: nowUnix - 1,
    };
    const raw = addPendingRecord({} as RawWalletV1, pending);
    const { raw: next, changed } = dropExpiredTtl(raw, nowUnix);
    expect(changed).toBe(true);
    expect(readPendingRecords(next)).toEqual([]);
  });
});

describe("ttlRefetchMs", () => {
  it("returns ms until soonest future expiry, or false", () => {
    const nowUnix = 1_000_000;
    expect(ttlRefetchMs([], nowUnix)).toBe(false);
    expect(ttlRefetchMs([{ ttlExpiresAt: nowUnix - 1 }], nowUnix)).toBe(false);
    expect(ttlRefetchMs([{ ttlExpiresAt: nowUnix + 5 }], nowUnix)).toBe(5_000 + 250);
  });
});
