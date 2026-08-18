import { afterEach, describe, expect, it } from "vitest";
import { resetTipBlockAge, trackTipBlockAge } from "@/lib/network/tip-block-age";

const NODE = "https://node.example/";

afterEach(() => {
  resetTipBlockAge();
});

describe("trackTipBlockAge", () => {
  it("returns 0 on the first poll for a node", () => {
    expect(trackTipBlockAge(100, 1_000, NODE)).toBe(0);
  });

  it("adds elapsed time while height is unchanged", () => {
    trackTipBlockAge(100, 1_000, NODE);
    expect(trackTipBlockAge(100, 1_030, NODE)).toBe(30);
  });

  it("resets when height advances", () => {
    trackTipBlockAge(100, 1_000, NODE);
    trackTipBlockAge(100, 1_050, NODE);
    expect(trackTipBlockAge(101, 1_080, NODE)).toBe(0);
  });

  it("resets when the connected node URL changes", () => {
    trackTipBlockAge(100, 1_000, NODE);
    trackTipBlockAge(100, 1_040, NODE);
    expect(trackTipBlockAge(100, 1_070, "https://other.example/")).toBe(0);
  });

  it("resets after a stale gap between polls", () => {
    trackTipBlockAge(100, 1_000, NODE);
    trackTipBlockAge(100, 1_030, NODE);
    expect(trackTipBlockAge(100, 1_200, NODE)).toBe(0);
  });
});
