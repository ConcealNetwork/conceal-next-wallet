import { describe, expect, it } from "vitest";
import {
  ccxAmount,
  formatCcx,
  formatUsd,
  timeAgo,
  truncateAddress,
  usdAmount,
  usdSubline,
} from "@/lib/utils";

describe("wallet utils", () => {
  it("formats CCX amounts from atomic units", () => {
    expect(formatCcx(ccxAmount(1250.5))).toBe("1,250.500000 CCX"); // default is now 6dp
    expect(formatCcx(7.5, 6)).toBe("7.500000 CCX");
    expect(formatCcx(617.25, 6, true)).toBe("617.25 CCX");
    expect(formatCcx(12962.25, 6, true)).toBe("12,962.25 CCX");
    expect(formatCcx(7.5, 6, true)).toBe("7.5 CCX");
  });

  it("formats USD amounts", () => {
    expect(formatUsd(usdAmount(56.2725))).toBe("$56.27"); // fiat defaults to 2dp
    expect(formatUsd(usdAmount(56.2725), 4)).toBe("$56.2725"); // sub-cent precision on request
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

  it("keeps the bare formatters at their en-US default output (backward compat)", () => {
    // Passing no locale must be byte-identical to today's output so existing
    // tests and non-component callers never break.
    expect(formatCcx(ccxAmount(1250.5))).toBe(formatCcx(ccxAmount(1250.5), undefined, undefined));
    expect(formatCcx(1234567.89, 2)).toBe("1,234,567.89 CCX");
    expect(formatUsd(1234567.5, 2)).toBe("$1,234,567.50");
    // Default timeAgo keeps the wallet's original shorthand, including "just now".
    expect(timeAgo("2026-05-22T00:00:00.000Z", new Date("2026-05-22T00:00:30.000Z"))).toBe(
      "just now",
    );
  });

  it("formats CCX with locale grouping when a locale is supplied", () => {
    // es-ES groups thousands with "." and uses "," as the decimal separator.
    expect(formatCcx(1234567.89, 2, false, "es-ES")).toBe("1.234.567,89 CCX");
    // The bare call is unchanged by the locale-aware overload existing.
    expect(formatCcx(1234567.89, 2)).toBe("1,234,567.89 CCX");
  });

  it("formats USD with locale grouping when a locale is supplied", () => {
    expect(formatUsd(1234567.5, 2, "es-ES")).toBe("$1.234.567,50");
    expect(formatUsd(1234567.5, 2)).toBe("$1,234,567.50");
  });

  it("formats relative time via Intl.RelativeTimeFormat for a locale", () => {
    const now = new Date("2026-05-22T01:00:00.000Z");
    // 5 minutes earlier → Spanish narrow relative time.
    expect(timeAgo("2026-05-22T00:55:00.000Z", now, "es-ES")).toBe("hace 5 min");
    // English locale path uses Intl too (numeric:"auto" → "yesterday" for 1 day).
    expect(timeAgo("2026-05-21T01:00:00.000Z", now, "en-US")).toBe("yesterday");
  });

  it("builds a fiat subline, hiding it only when the price is unknown/zero", () => {
    expect(usdSubline(100, 0.045)).toBe(`${formatUsd(4.5)} USD`);
    expect(usdSubline(100, 0)).toBeUndefined(); // price not loaded → hidden (no $0.00 flash)
    expect(usdSubline(0, 0.045)).toBe(`${formatUsd(0)} USD`); // gate is on price, not amount
  });
});
