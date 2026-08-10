import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptWithSecret } from "@/lib/auth/webauthn-crypto";

const {
  enrollPasskeyCredential,
  unlockWithPasskey,
  signalPasskeyRemoved,
  isCordovaBiometricUnlockAvailable,
  cordovaBiometricEnroll,
  cordovaBiometricUnlock,
  cordovaBiometricRemove,
} = vi.hoisted(() => ({
  enrollPasskeyCredential: vi.fn(),
  unlockWithPasskey: vi.fn(),
  signalPasskeyRemoved: vi.fn(),
  isCordovaBiometricUnlockAvailable: vi.fn(),
  cordovaBiometricEnroll: vi.fn(),
  cordovaBiometricUnlock: vi.fn(),
  cordovaBiometricRemove: vi.fn(),
}));

vi.mock("@/lib/auth/webauthn-prf", () => ({
  isPasskeyUnlockAvailable: vi.fn(),
  enrollPasskeyCredential,
  unlockWithPasskey,
  signalPasskeyRemoved,
  PasskeyError: class PasskeyError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = "PasskeyError";
    }
  },
}));

vi.mock("@/lib/cordova/biometric-unlock", () => ({
  isCordovaBiometricUnlockAvailable,
  cordovaBiometricEnroll,
  cordovaBiometricUnlock,
  cordovaBiometricRemove,
}));

vi.mock("@/lib/cordova/runtime", () => ({
  isCordovaAndroid: vi.fn().mockReturnValue(true),
}));

import {
  enrollUnlockCredential,
  isBiometricUnlockAvailable,
  PasskeyError,
  signalUnlockRemoved,
  unlockWithBiometric,
} from "@/lib/auth/platform-unlock";
import { isPasskeyUnlockAvailable } from "@/lib/auth/webauthn-prf";

beforeEach(() => {
  vi.mocked(isPasskeyUnlockAvailable).mockReturnValue(false);
  isCordovaBiometricUnlockAvailable.mockReset();
  cordovaBiometricEnroll.mockReset();
  cordovaBiometricUnlock.mockReset();
  cordovaBiometricRemove.mockReset();
  enrollPasskeyCredential.mockReset();
  unlockWithPasskey.mockReset();
  signalPasskeyRemoved.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isBiometricUnlockAvailable", () => {
  it("prefers Cordova native on Android APK even when a WebAuthn stub exists", async () => {
    vi.mocked(isPasskeyUnlockAvailable).mockReturnValue(true);
    isCordovaBiometricUnlockAvailable.mockResolvedValue(true);
    expect(await isBiometricUnlockAvailable()).toBe(true);
  });

  it("uses WebAuthn when Cordova native is unavailable", async () => {
    vi.mocked(isPasskeyUnlockAvailable).mockReturnValue(true);
    isCordovaBiometricUnlockAvailable.mockResolvedValue(false);
    expect(await isBiometricUnlockAvailable()).toBe(true);
    expect(isCordovaBiometricUnlockAvailable).toHaveBeenCalled();
  });

  it("falls back to Cordova native when WebAuthn is absent", async () => {
    isCordovaBiometricUnlockAvailable.mockResolvedValue(true);
    expect(await isBiometricUnlockAvailable()).toBe(true);
  });
});

describe("enrollUnlockCredential", () => {
  it("prefers Cordova native on Android APK", async () => {
    vi.mocked(isPasskeyUnlockAvailable).mockReturnValue(true);
    isCordovaBiometricUnlockAvailable.mockResolvedValue(true);
    const secret = new Uint8Array(32).fill(7).buffer;
    cordovaBiometricEnroll.mockResolvedValue({ credentialId: "native-id", secret });
    const credential = await enrollUnlockCredential("wallet-password");
    expect(credential.credentialId).toBe("native-id");
    expect(enrollPasskeyCredential).not.toHaveBeenCalled();
  });

  it("uses WebAuthn when Cordova native is unavailable", async () => {
    vi.mocked(isPasskeyUnlockAvailable).mockReturnValue(true);
    enrollPasskeyCredential.mockResolvedValue({ credentialId: "web" });
    const result = await enrollUnlockCredential("pw");
    expect(enrollPasskeyCredential).toHaveBeenCalledWith("pw", []);
    expect(result.credentialId).toBe("web");
  });

  it("uses Cordova native on Android APK and stores encrypted password", async () => {
    isCordovaBiometricUnlockAvailable.mockResolvedValue(true);
    const secret = new Uint8Array(32).fill(7).buffer;
    cordovaBiometricEnroll.mockResolvedValue({ credentialId: "native-id", secret });
    const credential = await enrollUnlockCredential("wallet-password");
    expect(credential.credentialId).toBe("native-id");
    expect(credential.label).toBe("This device");
    expect(credential.encrypted.ciphertext).toBeTruthy();
  });

  it("maps Cordova cancel to PasskeyError cancelled", async () => {
    isCordovaBiometricUnlockAvailable.mockResolvedValue(true);
    cordovaBiometricEnroll.mockRejectedValue(new Error("cancelled"));
    await expect(enrollUnlockCredential("pw")).rejects.toMatchObject({ code: "cancelled" });
  });

  it("prefers a typed Cordova error code over the message string", async () => {
    isCordovaBiometricUnlockAvailable.mockResolvedValue(true);
    cordovaBiometricEnroll.mockRejectedValue({ code: "cancelled", message: "User dismissed" });
    await expect(enrollUnlockCredential("pw")).rejects.toMatchObject({ code: "cancelled" });
  });

  it("maps a typed unsupported code to PasskeyError unsupported", async () => {
    isCordovaBiometricUnlockAvailable.mockResolvedValue(true);
    cordovaBiometricEnroll.mockRejectedValue({ code: "unsupported" });
    await expect(enrollUnlockCredential("pw")).rejects.toMatchObject({ code: "unsupported" });
  });

  it("falls back to failed for an unrecognized Cordova error", async () => {
    isCordovaBiometricUnlockAvailable.mockResolvedValue(true);
    cordovaBiometricEnroll.mockRejectedValue({ code: "hardware_unavailable" });
    await expect(enrollUnlockCredential("pw")).rejects.toMatchObject({ code: "failed" });
  });

  it("maps a bare cancelled string rejection", async () => {
    isCordovaBiometricUnlockAvailable.mockResolvedValue(true);
    cordovaBiometricEnroll.mockRejectedValue("cancelled");
    await expect(enrollUnlockCredential("pw")).rejects.toMatchObject({ code: "cancelled" });
  });
});

describe("unlockWithBiometric", () => {
  it("delegates to WebAuthn when available", async () => {
    vi.mocked(isPasskeyUnlockAvailable).mockReturnValue(true);
    unlockWithPasskey.mockResolvedValue("recovered");
    const enrollment = { version: 2 as const, credentials: [] };
    expect(await unlockWithBiometric(enrollment)).toBe("recovered");
  });

  it("decrypts with Cordova native secret", async () => {
    isCordovaBiometricUnlockAvailable.mockResolvedValue(true);
    const secret = new Uint8Array(32).fill(3).buffer;
    const enrollment = {
      version: 2 as const,
      credentials: [
        {
          credentialId: "native-id",
          label: "This device",
          encrypted: await encryptWithSecret(secret, "my-password"),
          createdAt: "",
        },
      ],
    };
    cordovaBiometricUnlock.mockResolvedValue(secret);
    expect(await unlockWithBiometric(enrollment)).toBe("my-password");
  });
});

describe("signalUnlockRemoved", () => {
  it("cleans up both Cordova native and WebAuthn when both exist", async () => {
    vi.mocked(isPasskeyUnlockAvailable).mockReturnValue(true);
    await signalUnlockRemoved("cred");
    expect(cordovaBiometricRemove).toHaveBeenCalledWith("cred");
    expect(signalPasskeyRemoved).toHaveBeenCalledWith("cred");
  });

  it("calls Cordova remove when WebAuthn is absent", async () => {
    await signalUnlockRemoved("cred");
    expect(cordovaBiometricRemove).toHaveBeenCalledWith("cred");
  });
});

describe("PasskeyError re-export", () => {
  it("is the shared error type", () => {
    expect(new PasskeyError("failed", "x")).toBeInstanceOf(Error);
  });
});
