import { describe, expect, it } from "vitest";
import { COIN_URI_PREFIX } from "@/lib/config/config";
import { parseScannedSendPayload } from "@/lib/ui/parse-scanned-send-payload";

const ADDRESS = `ccx7${"a".repeat(94)}`;
const SPEND_KEY = "b".repeat(64);
const VIEW_KEY = "c".repeat(64);

describe("parseScannedSendPayload", () => {
  it("parses a v3 payment request URI", () => {
    const uri = `${COIN_URI_PREFIX}${ADDRESS}?payment_id=pid1?amount=12.5?label=note`;
    expect(parseScannedSendPayload(uri)).toEqual({
      address: ADDRESS,
      amount: 12.5,
      paymentId: "pid1",
      message: "note",
    });
  });

  it("parses a bare address", () => {
    expect(parseScannedSendPayload(ADDRESS)).toEqual({ address: ADDRESS });
  });

  it("extracts the address from a wallet import URI", () => {
    const uri = `conceal.${ADDRESS}?spend_key=${SPEND_KEY}?view_key=${VIEW_KEY}`;
    expect(parseScannedSendPayload(uri)).toEqual({ address: ADDRESS });
  });

  it("falls back to the raw payload when parsing fails", () => {
    expect(parseScannedSendPayload("not-a-valid-uri")).toEqual({ address: "not-a-valid-uri" });
  });

  it("returns null for empty input", () => {
    expect(parseScannedSendPayload("   ")).toBeNull();
  });
});
