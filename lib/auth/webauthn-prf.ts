/**
 * Passkey unlock via the WebAuthn PRF extension. Any authenticator that exposes
 * PRF — platform (Touch ID / Face ID / Windows Hello), roaming security keys, or
 * phone/password-manager passkeys — derives a stable per-credential secret from a
 * fixed app salt; that secret AES-GCM-encrypts the wallet password
 * (webauthn-crypto.ts). Only a successful user-verifying assertion can reproduce
 * the secret, so the stored ciphertext is useless on its own. No server, no
 * attestation verification — security rests on the OS-protected authenticator.
 *
 * Authenticators WITHOUT PRF (e.g. some password-manager passkeys) cannot protect
 * a secret, so enrollment refuses them with a clear message rather than silently
 * failing — the password remains the always-available unlock.
 */
import type { PasskeyCredential, PasskeyEnrollment } from "@/lib/auth/biometric-store";
import {
  base64urlToBytes,
  bytesToBase64url,
  decryptWithSecret,
  encryptWithSecret,
  PRF_SALT,
} from "@/lib/auth/webauthn-crypto";

export type PasskeyErrorCode = "cancelled" | "no-prf" | "failed" | "unsupported";

/** Typed failure so the UI can show the right message instead of a raw string. */
export class PasskeyError extends Error {
  constructor(
    readonly code: PasskeyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PasskeyError";
  }
}

/** WebAuthn is usable for passkey unlock at all (platform OR roaming authenticators). */
export function isPasskeyUnlockAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
}

/**
 * A user-verifying PLATFORM authenticator (Touch ID / Windows Hello) is present.
 * Used only to tailor copy ("biometric" vs "passkey"); roaming security keys and
 * phone passkeys still work when this is false.
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isPasskeyUnlockAvailable()) return false;
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

function labelFor(credential: PublicKeyCredential): string {
  // biome-ignore lint/suspicious/noExplicitAny: authenticatorAttachment isn't on the lib.dom type
  const attachment = (credential as any).authenticatorAttachment;
  if (attachment === "platform") return "This device";
  if (attachment === "cross-platform") return "Security key or phone";
  return "Passkey";
}

/**
 * Register an authenticator and encrypt `password` with its PRF secret. No
 * `authenticatorAttachment` is pinned, so platform and roaming authenticators
 * both qualify. Throws a {@link PasskeyError} on cancel or when the chosen
 * authenticator can't produce a PRF secret.
 */
export async function enrollPasskeyCredential(password: string): Promise<PasskeyCredential> {
  if (!isPasskeyUnlockAvailable()) {
    throw new PasskeyError("unsupported", "This browser doesn't support passkeys.");
  }

  let created: PublicKeyCredential | null;
  try {
    created = (await navigator.credentials.create({
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
          // No authenticatorAttachment → platform AND cross-platform both allowed.
          userVerification: "required",
          residentKey: "discouraged",
        },
        attestation: "none",
        // biome-ignore lint/suspicious/noExplicitAny: PRF extension input isn't in lib.dom yet
        extensions: { prf: { eval: { first: PRF_SALT } } } as any,
      },
    })) as PublicKeyCredential | null;
  } catch (error) {
    throw new PasskeyError("cancelled", asCancelMessage(error));
  }

  if (!created) throw new PasskeyError("cancelled", "Passkey enrollment was cancelled.");
  const credentialId = bytesToBase64url(created.rawId);

  // Some authenticators return the PRF result from create(); others only from a
  // follow-up get(). Try create() first, then fall back to an assertion.
  let secret = prfResult(created);
  if (!secret) {
    secret = (await assertPrfSecret([credentialId])).secret;
  }
  if (!secret) {
    throw new PasskeyError(
      "no-prf",
      "That passkey can't be used for unlock — it doesn't support the secure-unlock (PRF) extension. Use this device's built-in biometrics or a security key, and disable passkey handling in your password manager if it intercepted this.",
    );
  }

  return {
    credentialId,
    label: labelFor(created),
    encrypted: await encryptWithSecret(secret, password),
    createdAt: new Date().toISOString(),
  };
}

function asCancelMessage(error: unknown): string {
  // NotAllowedError covers both an explicit user cancel and a timeout.
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Passkey enrollment was cancelled.";
  }
  return "Couldn't register this passkey — please try again.";
}

async function assertPrfSecret(
  credentialIds: string[],
): Promise<{ secret?: ArrayBuffer; credentialId?: string }> {
  if (!credentialIds.length) return {};
  // Per-credential PRF salts — every enrolled credential evaluates the same app
  // salt, so whichever one the user taps yields its decryption secret.
  const evalByCredential: Record<string, { first: BufferSource }> = {};
  for (const id of credentialIds) evalByCredential[id] = { first: PRF_SALT };

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: credentialIds.map((id) => ({
        id: base64urlToBytes(id),
        type: "public-key",
      })),
      userVerification: "required",
      // biome-ignore lint/suspicious/noExplicitAny: PRF extension input isn't in lib.dom yet
      extensions: { prf: { evalByCredential } } as any,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) return {};
  return { secret: prfResult(assertion), credentialId: bytesToBase64url(assertion.rawId) };
}

/**
 * Recover the wallet password via a user-verifying assertion against any of the
 * enrolled credentials. Throws a {@link PasskeyError} on cancel/failure.
 */
export async function unlockWithPasskey(enrollment: PasskeyEnrollment): Promise<string> {
  const ids = enrollment.credentials.map((c) => c.credentialId);
  let result: { secret?: ArrayBuffer; credentialId?: string };
  try {
    result = await assertPrfSecret(ids);
  } catch (error) {
    throw new PasskeyError("cancelled", asCancelMessage(error));
  }

  const match = enrollment.credentials.find((c) => c.credentialId === result.credentialId);
  if (!result.secret || !match) {
    throw new PasskeyError(
      "failed",
      "Passkey unlock failed — unlock with your password, then re-enable it in Settings.",
    );
  }
  return decryptWithSecret(result.secret, match.encrypted);
}
