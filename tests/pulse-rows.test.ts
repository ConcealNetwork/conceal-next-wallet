import { describe, expect, it } from "vitest";
import { buildPulseRows } from "@/lib/messages/pulse-rows";
import type { AddressEntry, Message } from "@/lib/types";

const BOB_PID = "b".repeat(64);

const bob: AddressEntry = {
  id: "bob",
  label: "Bob",
  address: "ccx7bob",
  paymentId: BOB_PID,
  paymentIdTo: "a".repeat(64),
  relationship: true,
};

function msg(over: Partial<Message>): Message {
  return {
    id: "m1",
    direction: "received",
    counterpartyName: "Bob",
    counterpartyAddress: `recv:${BOB_PID}`,
    body: "{status,alive,2026-07-02,2}",
    hasBody: true,
    timestamp: "2026-06-01T00:00:00.000Z",
    unread: false,
    paymentIdFrom: BOB_PID,
    paymentIdTo: null,
    blockHeight: 1,
    threadKey: "t",
    ...over,
  } as Message;
}

describe("buildPulseRows", () => {
  it("matches inbound pulse by contact paymentId", () => {
    const rows = buildPulseRows([msg({})], [bob], new Set(), Date.parse("2026-06-15"));
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Bob");
    expect(rows[0].pulse.until).toBe("2026-07-02");
    expect(rows[0].phase).toBe("ok");
  });

  it("skips dismissed rows", () => {
    const rows = buildPulseRows([msg({ id: "x" })], [bob], new Set(["x"]), Date.now());
    expect(rows).toHaveLength(0);
  });
});
