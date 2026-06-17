/**
 * Biometric unlock via the WebAuthn PRF extension. The platform authenticator
 * (Touch ID / Face ID / Windows Hello) derives a stable per-credential secret
 * from a fixed app salt; that secret AES-GCM-encrypts the wallet password
 * (webauthn-crypto.ts). Only a successful biometric assertion can reproduce the
 * secret, so unlocking requires the user's biometric. No server, no attestation
 * verification — security rests on the OS-protected platform authenticator.
 */
import {
  base64urlToBytes,
  bytesToBase64url,
  decryptWithSecret,
  type EncryptedSecret,
  encryptWithSecret,
  PRF_SALT,
} from "@/lib/auth/webauthn-crypto";

export interface BiometricEnrollment {
  /** base64url credential id, passed in allowCredentials on unlock. */
  credentialId: string;
  encrypted: EncryptedSecret;
  /** Wallet address this enrollment encrypts the password for. Lets the app drop
   *  a stale enrollment when a different wallet is opened (import / re-create). */
  address?: string;
}

/** True only when a user-verifying platform authenticator is present. */
export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || typeof window.PublicKeyCredential === "undefined") {
    return false;
  }
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function prfResult(credential: PublicKeyCredential | null): ArrayBuffer | undefined {
  // biome-ignore lint/suspicious/noExplicitAny: PRF extension types aren't in lib.dom yet
  const results = (credential?.getClientExtensionResults() as any)?.prf?.results?.first;
  return results instanceof ArrayBuffer ? results : undefined;
}

/**
 * Register a platform credential and encrypt `password` with its PRF secret.
 * Returns the enrollment to persist, or throws if the user cancels or the
 * authenticator doesn't support PRF.
 */
export async function enrollBiometric(password: string): Promise<BiometricEnrollment> {
  const created = (await navigator.credentials.create({
    publicKey: {
      rp: { name: "Conceal Wallet" }, // id defaults to the current origin domain
      user: {
        id: crypto.getRandomValues(new Uint8Array(32)),
        name: "conceal-wallet",
        displayName: "Conceal Wallet",
      },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "discouraged",
      },
      attestation: "none",
      // biome-ignore lint/suspicious/noExplicitAny: PRF extension input isn't in lib.dom yet
      extensions: { prf: { eval: { first: PRF_SALT } } } as any,
    },
  })) as PublicKeyCredential | null;

  if (!created) throw new Error("Biometric enrollment was cancelled.");
  const credentialId = bytesToBase64url(created.rawId);

  // Some platforms return the PRF result from create(); others only from a
  // follow-up get(). Try create() first, then fall back to an assertion.
  let secret = prfResult(created);
  if (!secret) {
    secret = await assertPrfSecret(credentialId);
  }
  if (!secret) {
    throw new Error("This device doesn't support biometric unlock (no WebAuthn PRF).");
  }

  const encrypted = await encryptWithSecret(secret, password);
  return { credentialId, encrypted };
}

async function assertPrfSecret(credentialId: string): Promise<ArrayBuffer | undefined> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [
        { id: base64urlToBytes(credentialId), type: "public-key", transports: ["internal"] },
      ],
      userVerification: "required",
      // biome-ignore lint/suspicious/noExplicitAny: PRF extension input isn't in lib.dom yet
      extensions: { prf: { eval: { first: PRF_SALT } } } as any,
    },
  })) as PublicKeyCredential | null;
  return prfResult(assertion);
}

/** Recover the wallet password via a biometric assertion. Throws on cancel/failure. */
export async function unlockWithBiometric(enrollment: BiometricEnrollment): Promise<string> {
  const secret = await assertPrfSecret(enrollment.credentialId);
  if (!secret) {
    throw new Error("Biometric unlock failed — re-enrol biometric unlock in Settings.");
  }
  return decryptWithSecret(secret, enrollment.encrypted);
}
