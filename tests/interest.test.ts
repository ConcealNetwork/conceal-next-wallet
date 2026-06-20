import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InterestCalculator } from "@/lib/deposits/interest";

// Interest.ts is legacy wallet-core that resolves `config` / `logDebugMsg` from
// globals (matching the in-browser runtime). Stub them for the unit under test.
const g = globalThis as unknown as {
  config?: Record<string, unknown>;
  logDebugMsg?: (...args: unknown[]) => void;
};

describe("InterestCalculator — legacy V1 path", () => {
  beforeAll(() => {
    g.config = { coinUnitPlaces: 6, depositHeightV3: 413400, depositRateV3: [] };
    g.logDebugMsg = () => {};
  });
  afterAll(() => {
    g.config = undefined;
    g.logDebugMsg = undefined;
  });

  // term=5041 is not a multiple of 5040/21900/64800, so it falls through to the
  // V1 fallback. Expected values mirror conceal-core Currency.cpp:268-289 with the
  // CryptoNoteConfig.h constants: a = term*4; base = floor(amount*a / (100*262800));
  // interest = base*100 when lockHeight <= 12750, else base.
  const amount = 1_000_000;
  const term = 5041; // a = 20164; base = floor(20_164_000_000 / 26_280_000) = 767

  it("applies the 100× early-deposit multiplier on/before block 12750", () => {
    expect(InterestCalculator.calculateInterest(amount, term, 10_000)).toBe(76_700);
    // Boundary is inclusive (<=).
    expect(InterestCalculator.calculateInterest(amount, term, 12_750)).toBe(76_700);
  });

  it("drops the multiplier after the early-deposit window", () => {
    expect(InterestCalculator.calculateInterest(amount, term, 12_751)).toBe(767);
    expect(InterestCalculator.calculateInterest(amount, term, 20_000)).toBe(767);
  });

  it("truncates the division before multiplying (matches the daemon's int math)", () => {
    // base is floored to 767 first, so the multiplied result is 76_700, not
    // floor(767.2754 * 100) = 76_727 — the bit-exact daemon behavior.
    expect(InterestCalculator.calculateInterest(amount, term, 1)).toBe(76_700);
  });

  it("stays exact for large deposits where float math loses precision", () => {
    // amount*a here exceeds Number.MAX_SAFE_INTEGER; the daemon uses 128-bit
    // mul128/div128_32. BigInt gives base = 16_438_383_563_818 (×100), whereas
    // naive float division floors to ...819 — a 100-atomic-unit error.
    expect(InterestCalculator.calculateInterest(90_000_000_011_909, 1_200_002, 1)).toBe(
      1_643_838_356_381_800,
    );
  });
});

// ---------------------------------------------------------------------------
// GOLDEN-MASTER characterization tests (#91 de-globalization).
//
// These pin the EXACT current output of `calculateInterest` across every
// routing path (V3 monthly, V2 investment, V2 weekly) so the relocation of
// InterestCalculator off `lib/wallet-core` can be proven behaviour-preserving.
// The expected numbers are captured from the UNCHANGED implementation — do NOT
// edit them to match a refactor; if a number moves, the refactor changed math.
//
// The config stub mirrors REAL mode exactly (`public/config.js`): it provides
// only `coinUnitPlaces` + `depositRateV3`; `depositHeightV3` matches the static
// default, and `investmentMq` / `weeklyBaseInterest` / `weeklyInterestIncrement`
// are absent → the hardcoded daemon defaults (1.4473 / 0.0696 / 0.0002) apply,
// which is exactly what the de-globalized module hardcodes.
// ---------------------------------------------------------------------------
describe("InterestCalculator — golden master (real-mode config)", () => {
  const M = 1_000_000; // atomic units per CCX (coinUnitPlaces = 6)
  const LOCK = 999_999_999; // above DEPOSIT_HEIGHT_V3 → routes monthly terms to V3

  beforeAll(() => {
    g.config = {
      coinUnitPlaces: 6,
      depositRateV3: [0.029, 0.039, 0.049],
      depositHeightV3: 413400,
    };
    g.logDebugMsg = () => {};
  });
  afterAll(() => {
    g.config = undefined;
    g.logDebugMsg = undefined;
  });

  describe("V3 path — monthly term (term % 21900 === 0, lockHeight > 413400)", () => {
    it("tier 1 (< 10000 CCX, base 2.9%)", () => {
      expect(InterestCalculator.calculateInterest(1000 * M, 21900, LOCK)).toBe(2_416_666);
      expect(InterestCalculator.calculateInterest(1000 * M, 21900 * 12, LOCK)).toBe(40_000_000);
      // Months cap at 12 — a 24-month term yields the same as 12 months.
      expect(InterestCalculator.calculateInterest(1000 * M, 21900 * 24, LOCK)).toBe(40_000_000);
      expect(InterestCalculator.calculateInterest(9999 * M, 21900 * 6, LOCK)).toBe(169_983_000);
    });

    it("tier 2 (10000–19999 CCX, base 3.9%)", () => {
      expect(InterestCalculator.calculateInterest(10000 * M, 21900, LOCK)).toBe(32_500_000);
      expect(InterestCalculator.calculateInterest(15000 * M, 21900 * 12, LOCK)).toBe(750_000_000);
      expect(InterestCalculator.calculateInterest(19999 * M, 21900 * 3, LOCK)).toBe(204_989_750);
    });

    it("tier 3 (>= 20000 CCX, base 4.9%)", () => {
      expect(InterestCalculator.calculateInterest(20000 * M, 21900, LOCK)).toBe(81_666_666);
      expect(InterestCalculator.calculateInterest(50000 * M, 21900 * 12, LOCK)).toBe(3_000_000_000);
    });

    it("routes to V3 just above the DEPOSIT_HEIGHT_V3 boundary (lockHeight 413401)", () => {
      expect(InterestCalculator.calculateInterest(1000 * M, 21900, 413_401)).toBe(2_416_666);
    });
  });

  describe("V2 investment path (term % 64800 === 0) — investmentMq default 1.4473", () => {
    it("quarterly compounding with quantity-tier bonus", () => {
      expect(InterestCalculator.calculateInterest(1000 * M, 64800, LOCK)).toBe(14_545_364);
      // 200000 CCX → qTier 1.02; 2 quarters.
      expect(InterestCalculator.calculateInterest(200000 * M, 64800 * 2, LOCK)).toBe(6_007_192_570);
      // 2500000 CCX → qTier 1.15 (> 2000000); 4 quarters.
      expect(InterestCalculator.calculateInterest(2500000 * M, 64800 * 4, LOCK)).toBe(
        173_489_564_338,
      );
    });
  });

  describe("V2 weekly path (term % 5040 === 0) — weeklyBaseInterest/Increment defaults", () => {
    it("weekly accrual with per-week increment", () => {
      expect(InterestCalculator.calculateInterest(1000 * M, 5040, LOCK)).toBe(698_000);
      expect(InterestCalculator.calculateInterest(1000 * M, 5040 * 10, LOCK)).toBe(7_160_000);
      expect(InterestCalculator.calculateInterest(50000 * M, 5040 * 4, LOCK)).toBe(140_799_999);
    });
  });
});
