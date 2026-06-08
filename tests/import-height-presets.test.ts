import { describe, expect, it } from "vitest";
import {
  describeScanHeight,
  estimateScanHeight,
  type ImportHeightPreset,
} from "@/lib/ui/import-height-presets";

// Fixed clock = the reference date, so the math is deterministic.
const NOW = new Date(Date.UTC(2026, 5, 6));

describe("import height presets", () => {
  it("maps 'Not sure' to a genesis scan (0)", () => {
    expect(estimateScanHeight("unsure", NOW)).toBe(0);
  });

  it("orders presets from most recent (highest block) to oldest", () => {
    const heights = (["month", "year", "1-2y", "older", "unsure"] as ImportHeightPreset[]).map(
      (p) => estimateScanHeight(p, NOW),
    );
    // strictly decreasing
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBeLessThan(heights[i - 1]);
    }
    expect(heights.at(-1)).toBe(0);
  });

  it("errs early — 'this year' starts before the reference tip", () => {
    const year = estimateScanHeight("year", NOW);
    expect(year).toBeGreaterThan(1_950_000);
    expect(year).toBeLessThan(2_088_835); // strictly before the observed tip
  });

  it("never returns a negative height", () => {
    expect(estimateScanHeight("older", NOW)).toBeGreaterThanOrEqual(0);
  });

  it("anchors on the live chain tip when one is supplied", () => {
    const offline = estimateScanHeight("year", NOW);
    const live = estimateScanHeight("year", NOW, 3_000_000);
    expect(live).toBeGreaterThan(offline); // a higher live tip → a higher start block
    expect(live).toBeLessThan(3_000_000); // still before the tip (subtracts the year)
    expect(live).toBeGreaterThan(2_800_000);
  });

  it("ignores a missing/invalid tip and falls back to the estimate", () => {
    const offline = estimateScanHeight("year", NOW);
    expect(estimateScanHeight("year", NOW, null)).toBe(offline);
    expect(estimateScanHeight("year", NOW, 0)).toBe(offline);
  });

  it("describes the readout in plain language", () => {
    expect(describeScanHeight("unsure", NOW).text).toMatch(/whole history/i);
    const year = describeScanHeight("year", NOW);
    expect(year.text).toMatch(/2026/);
    expect(year.range).toMatch(/block/i);
  });
});
