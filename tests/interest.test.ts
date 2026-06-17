import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InterestCalculator } from "@/lib/wallet-core/Interest";

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
