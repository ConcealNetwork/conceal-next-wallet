import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, useI18n } from "@/lib/i18n/i18n-provider";

function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

describe("I18nProvider t()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves known keys and falls back to the raw key for unknown ones", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.t("nav.account")).toBe("Account");
    expect(result.current.t("totally.missing.key")).toBe("totally.missing.key");
  });

  it("dev-warns once when a key is missing from both the locale and the fallback", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { result } = renderHook(() => useI18n(), { wrapper });
    // A unique key so the module-level dedupe set can't have seen it before.
    const missingKey = `missing.${Math.random().toString(36).slice(2)}`;
    result.current.t(missingKey);
    result.current.t(missingKey);
    const calls = warn.mock.calls.filter((args) => String(args[0]).includes(missingKey));
    expect(calls).toHaveLength(1); // de-duplicated to one warning per key
    expect(String(calls[0][0])).toContain(missingKey);
  });
});
