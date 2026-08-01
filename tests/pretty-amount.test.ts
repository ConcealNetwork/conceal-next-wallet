import { PRETTY_AMOUNTS } from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import { isPrettyAmount } from "@/lib/services/real-sdk/spend";

describe("isPrettyAmount", () => {
  it("accepts ladder amounts including 1..9 × 10^k", () => {
    expect(isPrettyAmount(1)).toBe(true);
    expect(isPrettyAmount(7_000_000)).toBe(true);
    expect(isPrettyAmount(1_000_000)).toBe(true);
    for (const amount of PRETTY_AMOUNTS.slice(0, 30)) {
      expect(isPrettyAmount(amount)).toBe(true);
    }
  });

  it("rejects odd leftover denominations", () => {
    expect(isPrettyAmount(7_016_906)).toBe(false);
    expect(isPrettyAmount(12_345)).toBe(false);
  });
});
