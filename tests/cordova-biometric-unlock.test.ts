import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bytesToBase64url } from "@/lib/auth/webauthn-crypto";
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

/** A valid 32-byte secret (AES-256 key material). */
function secret32(seed = 1) {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i + seed) % 256;
  return bytesToBase64url(bytes);
}

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
  it("returns credential id and a 32-byte secret", async () => {
    plugin.enroll.mockResolvedValue({
      credentialId: "abc",
      secretBase64url: secret32(),
    });
    const result = await cordovaBiometricEnroll();
    expect(result.credentialId).toBe("abc");
    expect(result.secret.byteLength).toBe(32);
  });

  it("fails closed when the plugin returns a secret that is not 32 bytes", async () => {
    plugin.enroll.mockResolvedValue({
      credentialId: "abc",
      secretBase64url: "AQID", // 3 bytes — must be rejected
    });
    await expect(cordovaBiometricEnroll()).rejects.toThrow(/32 bytes/);
  });
});

describe("cordovaBiometricUnlock", () => {
  it("returns a 32-byte secret for a credential", async () => {
    plugin.unlock.mockResolvedValue({ secretBase64url: secret32(7) });
    const secret = await cordovaBiometricUnlock("abc");
    expect(secret.byteLength).toBe(32);
  });

  it("fails closed when the plugin returns a secret that is not 32 bytes", async () => {
    plugin.unlock.mockResolvedValue({ secretBase64url: "BAUG" }); // 3 bytes
    await expect(cordovaBiometricUnlock("abc")).rejects.toThrow(/32 bytes/);
  });
});

describe("cordovaBiometricRemove", () => {
  it("delegates to the native plugin", async () => {
    plugin.remove.mockResolvedValue(undefined);
    await cordovaBiometricRemove("abc");
    expect(plugin.remove).toHaveBeenCalledWith("abc");
  });
});
