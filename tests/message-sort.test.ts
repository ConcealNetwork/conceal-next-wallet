import { describe, expect, it } from "vitest";
import { sortMessagesNewestFirst } from "@/lib/messages/conversations";
import { sortMessagesByHeight } from "@/lib/messages/thread-mappers";
import type { Message } from "@/lib/types";

function msg(partial: Partial<Message> & Pick<Message, "id">): Message {
  return {
    direction: "sent",
    counterpartyName: "X",
    counterpartyAddress: "ccx7",
    body: partial.id,
    hasBody: true,
    sentTo: null,
    timestamp: "2026-06-01T12:00:00.000Z",
    unread: false,
    blockHeight: 100,
    threadKey: "t",
    paymentIdFrom: null,
    paymentIdTo: null,
    ...partial,
  };
}

describe("sortMessagesByHeight (thread panel — oldest top, newest bottom)", () => {
  it("orders by timestamp, not block height, when one row is still pending", () => {
    const olderPending = msg({
      id: "pending",
      blockHeight: 0,
      timestamp: "2026-06-01T11:00:00.000Z",
    });
    const newerMined = msg({
      id: "mined",
      blockHeight: 2_104_857,
      timestamp: "2026-06-01T11:35:00.000Z",
    });
    const sorted = sortMessagesByHeight([newerMined, olderPending]);
    expect(sorted.map((m) => m.id)).toEqual(["pending", "mined"]);
  });

  it("puts a freshly sent pending message at the bottom when it is newest", () => {
    const olderMined = msg({
      id: "mined",
      blockHeight: 100,
      timestamp: "2026-06-01T11:00:00.000Z",
    });
    const newerPending = msg({
      id: "pending",
      blockHeight: 0,
      timestamp: "2026-06-01T11:35:00.000Z",
    });
    const sorted = sortMessagesByHeight([olderMined, newerPending]);
    expect(sorted.map((m) => m.id)).toEqual(["mined", "pending"]);
  });
});

describe("sortMessagesNewestFirst (flat inbox — newest first)", () => {
  it("ranks by timestamp, not pending blockHeight hack", () => {
    const olderPending = msg({
      id: "pending",
      blockHeight: 0,
      timestamp: "2026-06-01T11:00:00.000Z",
    });
    const newerMined = msg({
      id: "mined",
      blockHeight: 2_104_857,
      timestamp: "2026-06-01T11:35:00.000Z",
    });
    const sorted = sortMessagesNewestFirst([olderPending, newerMined]);
    expect(sorted.map((m) => m.id)).toEqual(["mined", "pending"]);
  });
});
