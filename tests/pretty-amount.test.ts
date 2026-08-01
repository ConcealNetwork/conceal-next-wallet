import { DUST_THRESHOLD, PRETTY_AMOUNTS } from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import { isPrettyAmount, selectSpendInputs } from "@/lib/services/real-sdk/spend";

function ownedOutput(amount: number, keyImage: string) {
  return {
    amount,
    globalIndex: 1,
    outputIndex: 0,
    txPublicKey: "aa".repeat(32),
    publicKey: "bb".repeat(32),
    keyImage,
  };
}

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

describe("selectSpendInputs", () => {
  it("skips pretty dust when larger outs cover the target", () => {
    const dust = ownedOutput(6, "11".repeat(32));
    const spendable = ownedOutput(1_000_000, "22".repeat(32));
    const { selected, total } = selectSpendInputs([dust, spendable], 100_000);
    expect(selected).toEqual([spendable]);
    expect(total).toBe(1_000_000);
    expect(selected.every((out) => out.amount >= DUST_THRESHOLD)).toBe(true);
  });

  it("throws when only dust remains for the target", () => {
    const dust = ownedOutput(DUST_THRESHOLD - 1, "33".repeat(32));
    expect(() => selectSpendInputs([dust], 1)).toThrow(/Insufficient spendable balance/);
  });
});
