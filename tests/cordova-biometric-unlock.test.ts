import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cordovaBiometricEnroll,
  cordovaBiometricRemove,
  cordovaBiometricUnlock,
  isCordovaBiometricUnlockAvailable,
} from "@/lib/cordova/biometric-unlock";

const plugin = {
  isAvailable: vi.fn(),
  enroll: vi.fn(),
  unlock: vi.fn(),
  remove: vi.fn(),
};

function setCordovaAndroid() {
  Object.defineProperty(globalThis, "window", {
    value: {
      cordova: { platformId: "android", plugins: { biometricUnlock: plugin } },
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: { addEventListener: vi.fn(), querySelector: vi.fn() },
    configurable: true,
  });
}

beforeEach(() => {
  plugin.isAvailable.mockReset();
  plugin.enroll.mockReset();
  plugin.unlock.mockReset();
  plugin.remove.mockReset();
  setCordovaAndroid();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isCordovaBiometricUnlockAvailable", () => {
  it("returns true when the native plugin reports availability", async () => {
    plugin.isAvailable.mockResolvedValue(true);
    expect(await isCordovaBiometricUnlockAvailable()).toBe(true);
  });

  it("returns false when the plugin is missing", async () => {
    Object.defineProperty(globalThis, "window", {
      value: { cordova: { platformId: "android", plugins: {} } },
      configurable: true,
    });
    expect(await isCordovaBiometricUnlockAvailable()).toBe(false);
  });
});

describe("cordovaBiometricEnroll", () => {
  it("returns credential id and secret bytes", async () => {
    plugin.enroll.mockResolvedValue({
      credentialId: "abc",
      secretBase64url: "AQID",
    });
    const result = await cordovaBiometricEnroll();
    expect(result.credentialId).toBe("abc");
    expect(new Uint8Array(result.secret)).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe("cordovaBiometricUnlock", () => {
  it("returns secret bytes for a credential", async () => {
    plugin.unlock.mockResolvedValue({ secretBase64url: "BAUG" });
    const secret = await cordovaBiometricUnlock("abc");
    expect(new Uint8Array(secret)).toEqual(new Uint8Array([4, 5, 6]));
  });
});

describe("cordovaBiometricRemove", () => {
  it("delegates to the native plugin", async () => {
    plugin.remove.mockResolvedValue(undefined);
    await cordovaBiometricRemove("abc");
    expect(plugin.remove).toHaveBeenCalledWith("abc");
  });
});
