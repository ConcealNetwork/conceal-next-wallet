import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDisplayTicker,
  getUseShortTicker,
  loadTickerPreference,
  setTickerPreference,
  stripTickerSuffix,
} from "@/lib/ui/ticker-preference";
import { formatCcx } from "@/lib/utils";

const storage = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@/lib/wallet-core/Storage", () => ({
  Storage: {
    getItem: vi.fn(async (key: string, defaultValue: unknown) =>
      storage.has(key) ? storage.get(key) : defaultValue,
    ),
    setItem: vi.fn(async (key: string, value: unknown) => {
      storage.set(key, value);
    }),
  },
}));

vi.mock("@/lib/wallet-core/Translations", () => ({
  tickerStore: {
    initialize: vi.fn(async () => {
      const { Storage } = await import("@/lib/wallet-core/Storage");
      const value = await Storage.getItem("useShortTicker", false);
      return value;
    }),
    get useShortTicker() {
      return Boolean(storage.get("useShortTicker"));
    },
    setTickerPreference: vi.fn(async (useShort: boolean) => {
      storage.set("useShortTicker", useShort);
    }),
  },
}));

describe("ticker preference", () => {
  beforeEach(async () => {
    storage.clear();
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

  it("migrates a legacy wallet-core value into localStorage on first load", async () => {
    localStorage.removeItem("useShortTicker");
    storage.set("useShortTicker", true); // value persisted by an older build
    expect(await loadTickerPreference()).toBe(true);
    expect(localStorage.getItem("useShortTicker")).toBe("true"); // seeded for the vault
  });
});
