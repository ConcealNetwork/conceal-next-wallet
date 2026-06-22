// @vitest-environment node
import { decodeAddress } from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import { WALLET_DONATION_ADDRESS } from "@/lib/config/config";
import { decodeFeeRecipient, safeNodeFeeAddress } from "@/lib/services/real-sdk/spend";

/**
 * Regression guard for the #195 dedup: `safeNodeFeeAddress` + `decodeFeeRecipient` were lifted
 * out of the transaction + message services into spend.ts. Their fallback behaviour is real
 * security work on the spend path — a malicious/broken node must not be able to throw on the
 * fee-decode path or redirect the fee anywhere unexpected. These tests pin that contract so a
 * future "refactor" can't quietly turn the fallback back into a throw.
 *
 * Runs in the `node` environment so conceal-lib-js auto-inits (the browser path needs `init()`).
 */
describe("real-sdk fee-recipient helpers (#195)", () => {
  it("falls back to the donation address when the node returns an undecodable fee address", () => {
    const donation = decodeAddress(WALLET_DONATION_ADDRESS);
    const decoded = decodeFeeRecipient("not-a-valid-address");
    expect(decoded.spendPublicKey).toBe(donation.spendPublicKey);
    expect(decoded.viewPublicKey).toBe(donation.viewPublicKey);
  });

  it("honours a valid node fee address", () => {
    const direct = decodeAddress(WALLET_DONATION_ADDRESS);
    const decoded = decodeFeeRecipient(WALLET_DONATION_ADDRESS);
    expect(decoded.spendPublicKey).toBe(direct.spendPublicKey);
    expect(decoded.viewPublicKey).toBe(direct.viewPublicKey);
  });

  it("returns '' when the daemon's getNodeFeeAddress throws (no fee charged / node error)", async () => {
    const out = await safeNodeFeeAddress({
      getNodeFeeAddress: async () => {
        throw new Error("node down");
      },
    });
    expect(out).toBe("");
  });

  it("returns the daemon's fee address on success", async () => {
    const out = await safeNodeFeeAddress({
      getNodeFeeAddress: async () => WALLET_DONATION_ADDRESS,
    });
    expect(out).toBe(WALLET_DONATION_ADDRESS);
  });
});
