import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAppBadge, isAppBadgeSupported, updateAppBadge } from "@/lib/notifications/app-badge";

/**
 * The Badging API isn't present in jsdom, so these install/tear-down fakes per
 * case. The guarantees: every entry point is feature-detected, the badge is set
 * only for positive counts and cleared otherwise, and nothing ever throws when
 * the API is absent or rejects.
 */

type BadgeNav = Record<string, unknown>;

function installBadge(opts?: { setRejects?: boolean }) {
  const setAppBadge = vi.fn(async (_count?: number) => {
    if (opts?.setRejects) throw new Error("denied");
  });
  const clearAppBadgeFn = vi.fn(async () => {});
  Object.defineProperty(navigator, "setAppBadge", {
    configurable: true,
    writable: true,
    value: setAppBadge,
  });
  Object.defineProperty(navigator, "clearAppBadge", {
    configurable: true,
    writable: true,
    value: clearAppBadgeFn,
  });
  return { setAppBadge, clearAppBadge: clearAppBadgeFn };
}

function removeBadge() {
  Reflect.deleteProperty(navigator as unknown as BadgeNav, "setAppBadge");
  Reflect.deleteProperty(navigator as unknown as BadgeNav, "clearAppBadge");
}

afterEach(() => {
  removeBadge();
  vi.restoreAllMocks();
});

describe("feature detection", () => {
  it("isAppBadgeSupported is false when the API is absent", () => {
    removeBadge();
    expect(isAppBadgeSupported()).toBe(false);
  });

  it("isAppBadgeSupported is true once setAppBadge exists", () => {
    installBadge();
    expect(isAppBadgeSupported()).toBe(true);
  });

  it("updateAppBadge / clearAppBadge no-op (never throw) when unsupported", () => {
    removeBadge();
    expect(() => updateAppBadge(5)).not.toThrow();
    expect(() => clearAppBadge()).not.toThrow();
  });
});

describe("updateAppBadge", () => {
  it("sets the badge for a positive count", () => {
    const { setAppBadge, clearAppBadge: clear } = installBadge();
    updateAppBadge(3);
    expect(setAppBadge).toHaveBeenCalledWith(3);
    expect(clear).not.toHaveBeenCalled();
  });

  it("clears the badge for zero / negative / non-finite counts", () => {
    const { setAppBadge, clearAppBadge: clear } = installBadge();
    updateAppBadge(0);
    updateAppBadge(-1);
    updateAppBadge(Number.NaN);
    expect(setAppBadge).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledTimes(3);
  });

  it("swallows a rejecting setAppBadge", () => {
    installBadge({ setRejects: true });
    expect(() => updateAppBadge(2)).not.toThrow();
  });
});

describe("clearAppBadge", () => {
  it("clears unconditionally when supported", () => {
    const { clearAppBadge: clear } = installBadge();
    clearAppBadge();
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
