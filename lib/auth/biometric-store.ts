/**
 * Persistence for the biometric enrollment. Stored in localStorage: the blob
 * (credential id + AES-GCM ciphertext of the password) is useless without the
 * device's platform authenticator, and localStorage is already cleared by the
 * panic wipe. Cleared explicitly on wallet delete and password change too (a
 * changed password makes the stored ciphertext stale).
 */
import type { BiometricEnrollment } from "@/lib/auth/webauthn-prf";

const STORAGE_KEY = "ccx-biometric-enrollment";

export function getBiometricEnrollment(): BiometricEnrollment | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BiometricEnrollment;
    if (parsed?.credentialId && parsed.encrypted?.iv && parsed.encrypted?.ciphertext) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function setBiometricEnrollment(enrollment: BiometricEnrollment): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(enrollment));
  } catch {
    // storage unavailable — biometric just won't persist
  }
}

export function clearBiometricEnrollment(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // best-effort
  }
}

export function hasBiometricEnrollment(): boolean {
  return getBiometricEnrollment() !== null;
}
