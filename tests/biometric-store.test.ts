import { beforeEach, describe, expect, it } from "vitest";
import {
  clearBiometricEnrollment,
  getBiometricEnrollment,
  hasBiometricEnrollment,
  setBiometricEnrollment,
} from "@/lib/auth/biometric-store";
import type { BiometricEnrollment } from "@/lib/auth/webauthn-prf";

const ENROLLMENT: BiometricEnrollment = {
  credentialId: "Y3JlZC1pZA",
  encrypted: { iv: "aXYtYnl0ZXM", ciphertext: "Y2lwaGVy" },
};

beforeEach(() => {
  clearBiometricEnrollment();
});

describe("biometric-store", () => {
  it("round-trips an enrollment", () => {
    expect(getBiometricEnrollment()).toBeNull();
    setBiometricEnrollment(ENROLLMENT);
    expect(getBiometricEnrollment()).toEqual(ENROLLMENT);
    expect(hasBiometricEnrollment()).toBe(true);
  });

  it("clears an enrollment", () => {
    setBiometricEnrollment(ENROLLMENT);
    clearBiometricEnrollment();
    expect(getBiometricEnrollment()).toBeNull();
    expect(hasBiometricEnrollment()).toBe(false);
  });

  it("returns null for malformed / partial stored data", () => {
    localStorage.setItem("ccx-biometric-enrollment", JSON.stringify({ credentialId: "x" }));
    expect(getBiometricEnrollment()).toBeNull();
    localStorage.setItem("ccx-biometric-enrollment", "not json");
    expect(getBiometricEnrollment()).toBeNull();
  });
});
