/**
 * Cordova bridge for cordova-plugin-biometric-unlock (Android APK only).
 * WebAuthn remains the primary path whenever PublicKeyCredential exists.
 */
import { base64urlToBytes } from "@/lib/auth/webauthn-crypto";
import { isCordovaAndroid, isCordovaShell, whenCordovaReady } from "@/lib/cordova/runtime";

export type CordovaBiometricEnrollResult = {
  credentialId: string;
  secretBase64url: string;
};

export type CordovaBiometricUnlockResult = {
  secretBase64url: string;
};

/** AES-256 key material — must match the native plugin contract (32 bytes). */
const BIOMETRIC_SECRET_BYTES = 32;

type CordovaBiometricUnlockPlugin = {
  isAvailable: () => Promise<boolean>;
  enroll: () => Promise<CordovaBiometricEnrollResult>;
  unlock: (credentialId: string) => Promise<CordovaBiometricUnlockResult>;
  remove: (credentialId: string) => Promise<void>;
};

type CordovaWindow = Window & {
  cordova?: {
    platformId?: string;
    plugins?: { biometricUnlock?: CordovaBiometricUnlockPlugin };
  };
};

function getPlugin(): CordovaBiometricUnlockPlugin | null {
  return (window as CordovaWindow).cordova?.plugins?.biometricUnlock ?? null;
}

function pluginReady(): boolean {
  const w = window as CordovaWindow;
  return !!(w.cordova?.platformId && w.cordova?.plugins?.biometricUnlock);
}

function decodeSecret(secretBase64url: string): ArrayBuffer {
  const bytes = base64urlToBytes(secretBase64url);
  if (bytes.byteLength !== BIOMETRIC_SECRET_BYTES) {
    throw new Error(
      `Biometric unlock secret must be ${BIOMETRIC_SECRET_BYTES} bytes (got ${bytes.byteLength}).`,
    );
  }
  return bytes.buffer;
}

/** Wait until the biometric plugin is attached (may lag deviceready by a tick). */
export async function whenCordovaBiometricReady(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isCordovaShell() || !isCordovaAndroid()) return;
  if (pluginReady()) return;

  await whenCordovaReady();
  if (pluginReady()) return;

  await new Promise<void>((resolve) => {
    const started = Date.now();
    const finish = () => resolve();
    const onReady = () => {
      if (pluginReady()) finish();
    };
    document.addEventListener("deviceready", onReady, { once: true });
    const poll = setInterval(() => {
      if (pluginReady() || Date.now() - started > 4000) {
        clearInterval(poll);
        document.removeEventListener("deviceready", onReady);
        finish();
      }
    }, 50);
  });
}

export async function isCordovaBiometricUnlockAvailable(): Promise<boolean> {
  await whenCordovaBiometricReady();
  if (!isCordovaAndroid()) return false;
  const plugin = getPlugin();
  if (!plugin) return false;
  try {
    return await plugin.isAvailable();
  } catch {
    return false;
  }
}

export async function cordovaBiometricEnroll(): Promise<{
  credentialId: string;
  secret: ArrayBuffer;
}> {
  await whenCordovaBiometricReady();
  const plugin = getPlugin();
  if (!plugin) throw new Error("Biometric unlock is not available.");
  const result = await plugin.enroll();
  return {
    credentialId: result.credentialId,
    secret: decodeSecret(result.secretBase64url),
  };
}

export async function cordovaBiometricUnlock(credentialId: string): Promise<ArrayBuffer> {
  await whenCordovaBiometricReady();
  const plugin = getPlugin();
  if (!plugin) throw new Error("Biometric unlock is not available.");
  const result = await plugin.unlock(credentialId);
  return decodeSecret(result.secretBase64url);
}

/** Best-effort native cleanup when a credential is removed in Settings. */
export async function cordovaBiometricRemove(credentialId: string): Promise<void> {
  await whenCordovaBiometricReady();
  const plugin = getPlugin();
  if (!plugin) return;
  try {
    await plugin.remove(credentialId);
  } catch {
    // native cleanup is a nicety — never block the UI
  }
}
