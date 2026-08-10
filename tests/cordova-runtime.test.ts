import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { whenCordovaPluginReady } from "@/lib/cordova/runtime";

type CordovaShape = {
  platformId?: string;
  plugins?: Record<string, unknown>;
};

function setCordova(cordova: CordovaShape | null) {
  Object.defineProperty(globalThis, "window", {
    value: { cordova: cordova ?? undefined },
    configurable: true,
  });
}

const originalEnv = { ...process.env };
const originalWindow = globalThis.window;

beforeEach(() => {
  process.env.NEXT_PUBLIC_CORDOVA = "true";
  Object.defineProperty(globalThis, "document", {
    value: { addEventListener: vi.fn(), querySelector: vi.fn() },
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  process.env = { ...originalEnv };
  globalThis.window = originalWindow;
  vi.restoreAllMocks();
});

describe("whenCordovaPluginReady", () => {
  it("resolves immediately when the plugin is already attached", async () => {
    setCordova({ platformId: "android", plugins: { biometricUnlock: {} } });
    await expect(whenCordovaPluginReady("plugins.biometricUnlock")).resolves.toBeUndefined();
  });

  it("is a no-op outside the Cordova shell", async () => {
    delete process.env.NEXT_PUBLIC_CORDOVA;
    setCordova(null);
    await expect(whenCordovaPluginReady("plugins.biometricUnlock")).resolves.toBeUndefined();
  });

  it("waits for deviceready, then resolves once the plugin has attached", async () => {
    vi.useFakeTimers();
    const listeners: Record<string, (e?: unknown) => void> = {};
    Object.defineProperty(globalThis, "document", {
      value: {
        addEventListener: vi.fn((event: string, cb: (e?: unknown) => void) => {
          listeners[event] = cb;
        }),
        querySelector: vi.fn(),
      },
      configurable: true,
    });
    // platformId absent -> whenCordovaReady waits for deviceready; plugin missing.
    setCordova({ plugins: {} });

    let resolved = false;
    const pending = whenCordovaPluginReady("plugins.biometricUnlock").then(() => {
      resolved = true;
    });

    // Simulate the plugin + platformId landing when deviceready fires.
    setCordova({ platformId: "android", plugins: { biometricUnlock: {} } });
    listeners.deviceready?.();
    await vi.advanceTimersByTimeAsync(0);

    await pending;
    expect(resolved).toBe(true);
  });

  it("polls until the plugin attaches after deviceready", async () => {
    vi.useFakeTimers();
    // platformId set so whenCordovaReady resolves immediately; plugin missing.
    setCordova({ platformId: "android", plugins: {} });

    let resolved = false;
    const pending = whenCordovaPluginReady("plugins.biometricUnlock").then(() => {
      resolved = true;
    });

    // Still polling before attachment.
    await vi.advanceTimersByTimeAsync(150);
    expect(resolved).toBe(false);

    // Plugin attaches mid-poll.
    setCordova({ platformId: "android", plugins: { biometricUnlock: {} } });
    await vi.advanceTimersByTimeAsync(100);

    await pending;
    expect(resolved).toBe(true);
  });

  it("gives up after the attachment timeout instead of hanging forever", async () => {
    vi.useFakeTimers();
    // platformId set so whenCordovaReady resolves immediately; plugin never attaches.
    setCordova({ platformId: "android", plugins: {} });

    let resolved = false;
    const pending = whenCordovaPluginReady("plugins.biometricUnlock").then(() => {
      resolved = true;
    });

    // Well past the 4000ms attachment timeout.
    await vi.advanceTimersByTimeAsync(5000);

    await pending;
    expect(resolved).toBe(true);
  });

  it("returns null for nested missing path segments without throwing", async () => {
    vi.useFakeTimers();
    setCordova({ platformId: "android" }); // no `plugins` at all
    let resolved = false;
    const pending = whenCordovaPluginReady("plugins.biometricUnlock").then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(5000);
    await pending;
    expect(resolved).toBe(true);
  });
});
