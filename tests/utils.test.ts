import { describe, expect, it } from "vitest";
import { ccxAmount, formatCcx, formatUsd, timeAgo, truncateAddress, usdAmount } from "@/lib/utils";

describe("wallet utils", () => {
  it("formats CCX amounts from atomic units", () => {
    expect(formatCcx(ccxAmount(1250.5))).toBe("1,250.50 CCX");
    expect(formatCcx(7.5, 6)).toBe("7.500000 CCX");
    expect(formatCcx(617.25, 6, true)).toBe("617.25 CCX");
    expect(formatCcx(12962.25, 6, true)).toBe("12,962.25 CCX");
    expect(formatCcx(7.5, 6, true)).toBe("7.5 CCX");
  });

  it("formats USD amounts", () => {
    expect(formatUsd(usdAmount(56.2725))).toBe("$56.2725");
    expect(formatUsd(125000, 0)).toBe("$125,000");
  });

  it("truncates long addresses", () => {
    expect(truncateAddress("ccx7abcdefghijklmnop", 6, 4)).toBe("ccx7ab...mnop");
  });

  it("renders compact relative time", () => {
    expect(timeAgo("2026-05-22T00:00:00.000Z", new Date("2026-05-22T01:00:00.000Z"))).toBe(
      "1h ago",
    );
  });
});
