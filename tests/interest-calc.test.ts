import { describe, expect, it } from "vitest";
import { computeDepositInterest, getDepositTierIndex } from "@/lib/deposits/interest-calc";

describe("getDepositTierIndex", () => {
  it("bands by principal", () => {
    expect(getDepositTierIndex(0)).toBe(0);
    expect(getDepositTierIndex(9999)).toBe(0);
    expect(getDepositTierIndex(10000)).toBe(1);
    expect(getDepositTierIndex(19999)).toBe(1);
    expect(getDepositTierIndex(20000)).toBe(2);
  });
});

describe("computeDepositInterest", () => {
  it("returns a positive estimate for a valid principal + term", () => {
    const r = computeDepositInterest(1000, 12);
    expect(r.interestCcx).toBeGreaterThan(0);
    expect(r.earPct).toBeGreaterThan(0);
    expect(r.eirPct).toBeGreaterThan(0);
  });

  it("zeroes a non-whole / non-positive principal", () => {
    expect(computeDepositInterest(0, 12)).toEqual({ interestCcx: 0, earPct: 0, eirPct: 0 });
    expect(computeDepositInterest(-5, 12)).toEqual({ interestCcx: 0, earPct: 0, eirPct: 0 });
    expect(computeDepositInterest(10.5, 12)).toEqual({ interestCcx: 0, earPct: 0, eirPct: 0 });
  });

  it("zeroes a non-positive / non-finite term (never returns a negative rate)", () => {
    expect(computeDepositInterest(1000, 0)).toEqual({ interestCcx: 0, earPct: 0, eirPct: 0 });
    expect(computeDepositInterest(1000, -3)).toEqual({ interestCcx: 0, earPct: 0, eirPct: 0 });
    expect(computeDepositInterest(1000, Number.NaN)).toEqual({
      interestCcx: 0,
      earPct: 0,
      eirPct: 0,
    });
  });
});
