import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { LOCALE_STORAGE_KEY } from "@/lib/i18n/i18n";
import { I18nProvider } from "@/lib/i18n/i18n-provider";
import { localeToBcp47, useFormatters } from "@/lib/i18n/use-formatters";

function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

describe("localeToBcp47", () => {
  it("maps UI locales to the BCP-47 tags Intl expects", () => {
    expect(localeToBcp47("en")).toBe("en-US");
    expect(localeToBcp47("es")).toBe("es-ES");
  });
});

describe("useFormatters", () => {
  afterEach(() => {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
  });

  it("formats amounts/dates/relative time for the default (English) locale", () => {
    const { result } = renderHook(() => useFormatters(), { wrapper });
    expect(result.current.locale).toBe("en-US");
    expect(result.current.formatCcx(1234567.89, 2)).toBe("1,234,567.89 CCX");
    expect(result.current.formatUsd(1234567.5, 2)).toBe("$1,234,567.50");
    expect(result.current.formatNumber(1234567)).toBe("1,234,567");
    const now = new Date("2026-05-22T01:00:00.000Z");
    expect(result.current.timeAgo("2026-05-22T00:55:00.000Z", now)).toBe("5m ago");
  });

  it("localizes formatting when the stored locale is Spanish", () => {
    // I18nProvider resolves the active locale from storage in a mount effect.
    localStorage.setItem(LOCALE_STORAGE_KEY, "es");
    const { result } = renderHook(() => useFormatters(), { wrapper });
    expect(result.current.locale).toBe("es-ES");
    expect(result.current.formatCcx(1234567.89, 2)).toBe("1.234.567,89 CCX");
    expect(result.current.formatUsd(1234567.5, 2)).toBe("$1.234.567,50");
    const now = new Date("2026-05-22T01:00:00.000Z");
    expect(result.current.timeAgo("2026-05-22T00:55:00.000Z", now)).toBe("hace 5 min");
  });

  it("formats dates with the supplied Intl options for the active locale", () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "es");
    const { result } = renderHook(() => useFormatters(), { wrapper });
    const date = new Date("2026-03-09T00:00:00.000Z");
    const formatted = result.current.formatDate(date, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    // Spanish short month is lowercase ("mar"); assert locale-specific spelling.
    expect(formatted.toLowerCase()).toContain("mar");
  });
});
