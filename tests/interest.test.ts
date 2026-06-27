import { calculateDepositInterest } from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";

function interest(amount: number, term: number, lockHeight: number): number {
  return calculateDepositInterest({ amount, term, lockHeight });
}

describe("calculateDepositInterest — legacy V1 path (SDK)", () => {
  const amount = 1_000_000;
  const term = 5041;

  it("applies the 100× early-deposit multiplier on/before block 12750", () => {
    expect(interest(amount, term, 10_000)).toBe(76_700);
    expect(interest(amount, term, 12_750)).toBe(76_700);
  });

  it("drops the multiplier after the early-deposit window", () => {
    expect(interest(amount, term, 12_751)).toBe(767);
    expect(interest(amount, term, 20_000)).toBe(767);
  });

  it("truncates the division before multiplying (matches the daemon's int math)", () => {
    expect(interest(amount, term, 1)).toBe(76_700);
  });

  it("stays exact for large deposits where float math loses precision", () => {
    expect(interest(90_000_000_011_909, 1_200_002, 1)).toBe(1_643_838_356_381_800);
  });
});

describe("calculateDepositInterest — golden master (SDK)", () => {
  const M = 1_000_000;
  const LOCK = 999_999_999;

  describe("V3 path — monthly term", () => {
    it("tier 1 (< 10000 CCX, base 2.9%)", () => {
      expect(interest(1000 * M, 21900, LOCK)).toBe(2_416_666);
      expect(interest(1000 * M, 21900 * 12, LOCK)).toBe(40_000_000);
      expect(interest(1000 * M, 21900 * 24, LOCK)).toBe(40_000_000);
      expect(interest(9999 * M, 21900 * 6, LOCK)).toBe(169_983_000);
    });

    it("tier 2 (10000–19999 CCX, base 3.9%)", () => {
      expect(interest(10000 * M, 21900, LOCK)).toBe(32_500_000);
      expect(interest(15000 * M, 21900 * 12, LOCK)).toBe(750_000_000);
      expect(interest(19999 * M, 21900 * 3, LOCK)).toBe(204_989_750);
    });

    it("tier 3 (>= 20000 CCX, base 4.9%)", () => {
      expect(interest(20000 * M, 21900, LOCK)).toBe(81_666_666);
      expect(interest(50000 * M, 21900 * 12, LOCK)).toBe(3_000_000_000);
    });

    it("routes to V3 just above DEPOSIT_HEIGHT_V3", () => {
      expect(interest(1000 * M, 21900, 413_401)).toBe(2_416_666);
    });
  });

  describe("V2 investment path (term % 64800 === 0)", () => {
    it("quarterly compounding with quantity-tier bonus", () => {
      expect(interest(1000 * M, 64800, LOCK)).toBe(14_545_364);
      expect(interest(200000 * M, 64800 * 2, LOCK)).toBe(6_007_192_570);
      expect(interest(2500000 * M, 64800 * 4, LOCK)).toBe(173_489_564_338);
    });
  });

  describe("V2 weekly path (term % 5040 === 0)", () => {
    it("weekly accrual with per-week increment", () => {
      expect(interest(1000 * M, 5040, LOCK)).toBe(698_000);
      expect(interest(1000 * M, 5040 * 10, LOCK)).toBe(7_160_000);
      expect(interest(50000 * M, 5040 * 4, LOCK)).toBe(140_799_999);
    });
  });
});
