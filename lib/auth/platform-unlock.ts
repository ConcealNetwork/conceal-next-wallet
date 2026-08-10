/**
 * Platform adapter for wallet biometric / passkey unlock.
 *
 * WebAuthn PRF is used whenever `PublicKeyCredential` exists (iOS PWA, desktop
 * browsers). Cordova Android APK falls back to the native biometric plugin when
 * WebAuthn is absent — never polyfill or override WebAuthn globally.
 */
import type { PasskeyCredential, PasskeyEnrollment } from "@/lib/auth/biometric-store";
import { decryptWithSecret, encryptWithSecret } from "@/lib/auth/webauthn-crypto";
import {
  enrollPasskeyCredential,
  isPasskeyUnlockAvailable,
  PasskeyError,
  signalPasskeyRemoved,
  unlockWithPasskey,
} from "@/lib/auth/webauthn-prf";
import {
  cordovaBiometricEnroll,
  cordovaBiometricRemove,
  cordovaBiometricUnlock,
  isCordovaBiometricUnlockAvailable,
} from "@/lib/cordova/biometric-unlock";
import { isCordovaAndroid } from "@/lib/cordova/runtime";

export { PasskeyError };

/** Cordova Android APK uses native biometrics even if a legacy polyfill stub exists. */
async function preferCordovaNativeUnlock(): Promise<boolean> {
  return isCordovaAndroid() && (await isCordovaBiometricUnlockAvailable());
}

/** True when passkey / biometric unlock can be offered on this platform. */
export async function isBiometricUnlockAvailable(): Promise<boolean> {
  if (await preferCordovaNativeUnlock()) return true;
  return isPasskeyUnlockAvailable();
}

type CordovaPluginError = {
  code?: unknown;
  message?: string;
};

/**
 * Resolve the single token `mapCordovaError` matches on. Prefer a typed plugin
 * `code` when the plugin supplies one (the robust contract), and fall back to
 * the error message string the plugin emits today so current behavior is kept.
 */
function readCordovaErrorToken(error: unknown): string | undefined {
  if (error == null) return undefined;
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const { code, message } = error as CordovaPluginError;
    if (typeof code === "string" && code.length > 0) return code;
    if (typeof message === "string") return message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function mapCordovaError(error: unknown): PasskeyError {
  const token = readCordovaErrorToken(error);
  if (token === "cancelled") {
    return new PasskeyError("cancelled", "Biometric enrollment was cancelled.");
  }
  if (token === "unsupported") {
    return new PasskeyError("unsupported", "Biometric unlock is not available on this device.");
  }
  return new PasskeyError("failed", "Biometric unlock failed — please try again.");
}

/**
 * Register an unlock credential (WebAuthn passkey or Cordova native biometric).
 */
export async function enrollUnlockCredential(
  password: string,
  existing: PasskeyCredential[] = [],
): Promise<PasskeyCredential> {
  if (await preferCordovaNativeUnlock()) {
    return enrollCordovaCredential(password, existing);
  }
  if (isPasskeyUnlockAvailable()) {
    return enrollPasskeyCredential(password, existing);
  }
  throw new PasskeyError("unsupported", "Biometric unlock is not available on this device.");
}

async function enrollCordovaCredential(
  password: string,
  existing: PasskeyCredential[] = [],
): Promise<PasskeyCredential> {
  try {
    const { credentialId, secret } = await cordovaBiometricEnroll();
    if (existing.some((c) => c.credentialId === credentialId)) {
      throw new PasskeyError(
        "already-enrolled",
        "This authenticator is already registered — use it to unlock, or add a different one.",
      );
    }
    return {
      credentialId,
      label: "This device",
      encrypted: await encryptWithSecret(secret, password),
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof PasskeyError) throw error;
    throw mapCordovaError(error);
  }
}

/** Recover the wallet password via passkey or native biometric. */
export async function unlockWithBiometric(enrollment: PasskeyEnrollment): Promise<string> {
  if (await preferCordovaNativeUnlock()) {
    return unlockCordova(enrollment);
  }
  if (isPasskeyUnlockAvailable()) {
    return unlockWithPasskey(enrollment);
  }
  throw new PasskeyError("unsupported", "Biometric unlock is not available on this device.");
}

async function unlockCordova(enrollment: PasskeyEnrollment): Promise<string> {
  let lastError: PasskeyError | undefined;
  for (const credential of enrollment.credentials) {
    try {
      const secret = await cordovaBiometricUnlock(credential.credentialId);
      return decryptWithSecret(secret, credential.encrypted);
    } catch (error) {
      const mapped = mapCordovaError(error);
      if (mapped.code === "cancelled") throw mapped;
      lastError = mapped;
    }
  }
  throw (
    lastError ??
    new PasskeyError(
      "failed",
      "Biometric unlock failed — unlock with your password, then re-enable it in Settings.",
    )
  );
}

/** Best-effort provider cleanup when a credential is removed. */
export async function signalUnlockRemoved(credentialId: string): Promise<void> {
  if (isCordovaAndroid()) {
    await cordovaBiometricRemove(credentialId);
  }
  if (isPasskeyUnlockAvailable()) {
    await signalPasskeyRemoved(credentialId);
  }
}
