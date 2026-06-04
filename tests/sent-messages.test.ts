import { describe, expect, it } from "vitest";
import {
  buildConversationTrackingId,
  normalizeSentMessagesFromRaw,
} from "@/lib/wallet-core/sent-messages";

const RECEIVER =
  "ccx7Exch7J9PpM5rK2sL8nV4xA1zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3mNo";

describe("sent message records", () => {
  it("builds conversation tracking id as address:paymentId", () => {
    expect(buildConversationTrackingId(RECEIVER)).toBe(`${RECEIVER}:`);
    expect(buildConversationTrackingId(RECEIVER, "abc123")).toBe(`${RECEIVER}:abc123`);
  });

  it("normalizes v2 array records", () => {
    expect(
      normalizeSentMessagesFromRaw([
        {
          txHash: "hash1",
          messageBody: "Hello",
          receiver: RECEIVER,
          paymentIdTo: "pid1",
        },
      ]),
    ).toEqual([
      {
        txHash: "hash1",
        messageBody: "Hello",
        receiver: RECEIVER,
        paymentIdTo: "pid1",
      },
    ]);
  });

  it("migrates legacy map format { txHash: body }", () => {
    expect(
      normalizeSentMessagesFromRaw({
        legacyHash: "Old body",
      }),
    ).toEqual([
      {
        txHash: "legacyHash",
        messageBody: "Old body",
        receiver: "",
      },
    ]);
  });

  it("returns empty array for missing or invalid input", () => {
    expect(normalizeSentMessagesFromRaw(undefined)).toEqual([]);
    expect(normalizeSentMessagesFromRaw(null)).toEqual([]);
    expect(normalizeSentMessagesFromRaw("bad")).toEqual([]);
    expect(normalizeSentMessagesFromRaw([{ txHash: "", messageBody: "x", receiver: "" }])).toEqual(
      [],
    );
  });
});
