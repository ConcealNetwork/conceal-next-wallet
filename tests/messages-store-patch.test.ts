import type { WalletState } from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import {
  createSentMessageRecord,
  minedHeightsFromState,
  patchSentMessageBlockHeights,
  pruneStaleMempoolReceived,
  type SdkMessageRecord,
} from "@/lib/services/real-sdk/messages-store";

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
