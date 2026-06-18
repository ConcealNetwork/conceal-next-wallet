import { describe, expect, it } from "vitest";
import { chooseRemoteFeeAddress } from "@/lib/wallet-core/fee-address";

const DONATION = "ccx7donation";
// Fake validity check: "ccx7…" of length ≥ 8 is "valid" for the test.
const isValid = (addr: string) => addr.startsWith("ccx7") && addr.length >= 8;

describe("chooseRemoteFeeAddress", () => {
  it("uses a valid node-supplied fee address", () => {
    expect(chooseRemoteFeeAddress("ccx7feeaddress", DONATION, isValid)).toBe("ccx7feeaddress");
  });

  it("falls back to the donation address for a malformed node address", () => {
    expect(chooseRemoteFeeAddress("not-an-address", DONATION, isValid)).toBe(DONATION);
    expect(chooseRemoteFeeAddress("ccx7", DONATION, isValid)).toBe(DONATION); // too short
  });

  it("falls back to the donation address for empty / null / undefined", () => {
    expect(chooseRemoteFeeAddress("", DONATION, isValid)).toBe(DONATION);
    expect(chooseRemoteFeeAddress(null, DONATION, isValid)).toBe(DONATION);
    expect(chooseRemoteFeeAddress(undefined, DONATION, isValid)).toBe(DONATION);
  });
});
