import { describe, expect, it } from "vitest";
import { normalizeThemePreference, resolveTheme } from "@/lib/ui/theme";

describe("normalizeThemePreference", () => {
  it("passes through valid preferences", () => {
    expect(normalizeThemePreference("light")).toBe("light");
    expect(normalizeThemePreference("dark")).toBe("dark");
    expect(normalizeThemePreference("system")).toBe("system");
  });

  it("falls back to system for unknown/empty values", () => {
    expect(normalizeThemePreference(null)).toBe("system");
    expect(normalizeThemePreference("")).toBe("system");
    expect(normalizeThemePreference("sepia")).toBe("system");
    expect(normalizeThemePreference(undefined)).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("honors explicit light/dark regardless of system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
  });

  it("follows the system preference when set to system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});
