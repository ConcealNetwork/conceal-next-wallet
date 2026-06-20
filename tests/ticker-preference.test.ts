import { beforeEach, describe, expect, it } from "vitest";
import {
  getDisplayTicker,
  getUseShortTicker,
  loadTickerPreference,
  setTickerPreference,
  stripTickerSuffix,
} from "@/lib/ui/ticker-preference";
import { formatCcx } from "@/lib/utils";

describe("ticker preference", () => {
  beforeEach(async () => {
    localStorage.clear();
    await setTickerPreference(false);
  });

  it("formats amounts with the short ticker when enabled", async () => {
    await setTickerPreference(true);
    expect(getDisplayTicker()).toBe("₡");
    expect(formatCcx(12.5)).toBe("12.500000 ₡");
    expect(stripTickerSuffix(formatCcx(12.5))).toBe("12.500000");
  });

  it("defaults to CCX", () => {
    expect(getDisplayTicker()).toBe("CCX");
    expect(formatCcx(12.5)).toBe("12.500000 CCX");
  });

  it("persists to the canonical localStorage key the vault backs up", async () => {
    await setTickerPreference(true);
    expect(localStorage.getItem("useShortTicker")).toBe("true");
    await setTickerPreference(false);
    expect(localStorage.getItem("useShortTicker")).toBe("false");
  });

  it("loads the value from localStorage", async () => {
    localStorage.setItem("useShortTicker", "true");
    expect(await loadTickerPreference()).toBe(true);
    expect(getUseShortTicker()).toBe(true);
  });

  it("defaults to false when no preference is stored", async () => {
    localStorage.removeItem("useShortTicker");
    expect(await loadTickerPreference()).toBe(false);
    expect(localStorage.getItem("useShortTicker")).toBe("false");
  });
});
