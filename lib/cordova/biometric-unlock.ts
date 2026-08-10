/**
 * Cordova bridge for cordova-plugin-biometric-unlock (Android APK only).
 * WebAuthn remains the primary path whenever PublicKeyCredential exists.
 */
import { base64urlToBytes } from "@/lib/auth/webauthn-crypto";
import { isCordovaAndroid, whenCordovaPluginReady } from "@/lib/cordova/runtime";

export type CordovaBiometricEnrollResult = {
  credentialId: string;
  secretBase64url: string;
};

export type CordovaBiometricUnlockResult = {
  secretBase64url: string;
};

type CordovaBiometricUnlockPlugin = {
  isAvailable: () => Promise<boolean>;
  enroll: () => Promise<CordovaBiometricEnrollResult>;
  unlock: (credentialId: string) => Promise<CordovaBiometricUnlockResult>;
  remove: (credentialId: string) => Promise<void>;
};

type CordovaWindow = Window & {
  cordova?: {
    plugins?: { biometricUnlock?: CordovaBiometricUnlockPlugin };
  };
};

const BIOMETRIC_PLUGIN_PATH = "plugins.biometricUnlock";

function getPlugin(): CordovaBiometricUnlockPlugin | null {
  return (window as CordovaWindow).cordova?.plugins?.biometricUnlock ?? null;
}

/**
 * Wait until the biometric plugin is ready. The Android gate lives here so it
 * is the single source of truth for the platform guard; readiness itself is
 * delegated to the canonical `whenCordovaPluginReady` runtime helper.
 */
async function whenBiometricReady(): Promise<void> {
  if (!isCordovaAndroid()) return;
  await whenCordovaPluginReady(BIOMETRIC_PLUGIN_PATH);
}

export async function isCordovaBiometricUnlockAvailable(): Promise<boolean> {
  await whenBiometricReady();
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
  await whenBiometricReady();
  const plugin = getPlugin();
  if (!plugin) throw new Error("Biometric unlock is not available.");
  const result = await plugin.enroll();
  return {
    credentialId: result.credentialId,
    secret: base64urlToBytes(result.secretBase64url).buffer,
  };
}

export async function cordovaBiometricUnlock(credentialId: string): Promise<ArrayBuffer> {
  await whenBiometricReady();
  const plugin = getPlugin();
  if (!plugin) throw new Error("Biometric unlock is not available.");
  const result = await plugin.unlock(credentialId);
  return base64urlToBytes(result.secretBase64url).buffer;
}

/** Best-effort native cleanup when a credential is removed in Settings. */
export async function cordovaBiometricRemove(credentialId: string): Promise<void> {
  await whenBiometricReady();
  const plugin = getPlugin();
  if (!plugin) return;
  try {
    await plugin.remove(credentialId);
  } catch {
    // native cleanup is a nicety — never block the UI
  }
}
