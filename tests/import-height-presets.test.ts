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
    const heights = (["month", "year", "1-2y", "older", "unsure"] as ImportHeightPreset[]).map((p) =>
      estimateScanHeight(p, NOW),
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

  it("describes the readout in plain language", () => {
    expect(describeScanHeight("unsure", NOW).text).toMatch(/whole history/i);
    const year = describeScanHeight("year", NOW);
    expect(year.text).toMatch(/2026/);
    expect(year.range).toMatch(/block/i);
  });
});
