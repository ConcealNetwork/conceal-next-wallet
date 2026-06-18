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
import { aaguidFromAuthData, authenticatorLabel } from "@/lib/auth/aaguid-names";
import type { PasskeyCredential, PasskeyEnrollment } from "@/lib/auth/biometric-store";
import {
  base64urlToBytes,
  bytesToBase64url,
  decryptWithSecret,
  encryptWithSecret,
  PRF_SALT,
} from "@/lib/auth/webauthn-crypto";

const CEREMONY_TIMEOUT_MS = 60_000;

export type PasskeyErrorCode =
  | "cancelled"
  | "no-prf"
  | "failed"
  | "unsupported"
  | "already-enrolled";

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

type CredentialRef = { id: string; transports?: AuthenticatorTransport[] };

/** WebAuthn is usable for passkey unlock at all (platform OR roaming authenticators). */
export function isPasskeyUnlockAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
}

/**
 * A user-verifying PLATFORM authenticator (Touch ID / Windows Hello) is present.
 * Used only to tailor copy ("biometric" vs "passkey"); roaming security keys and
 * phone passkeys still work when this is false.
 */
/**
 * Modern feature/capability detection (WebAuthn L3 `getClientCapabilities`).
 * Returns a flag map like `{ userVerifyingPlatformAuthenticator, hybridTransport,
 * signalUnknownCredential, … }`, or `{}` where the API is unsupported.
 */
export async function getPasskeyCapabilities(): Promise<Record<string, boolean>> {
  if (!isPasskeyUnlockAvailable()) return {};
  try {
    // biome-ignore lint/suspicious/noExplicitAny: getClientCapabilities isn't in lib.dom yet
    const getCaps = (window.PublicKeyCredential as any).getClientCapabilities;
    if (typeof getCaps !== "function") return {};
    return ((await getCaps.call(window.PublicKeyCredential)) as Record<string, boolean>) ?? {};
  } catch {
    return {};
  }
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isPasskeyUnlockAvailable()) return false;
  try {
    // Prefer the modern capability map; fall back to the classic probe.
    const caps = await getPasskeyCapabilities();
    if (typeof caps.userVerifyingPlatformAuthenticator === "boolean") {
      return caps.userVerifyingPlatformAuthenticator;
    }
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

function transportsOf(
  response: AuthenticatorAttestationResponse,
): AuthenticatorTransport[] | undefined {
  const list = response.getTransports?.() as AuthenticatorTransport[] | undefined;
  return list?.length ? list : undefined;
}

function labelFor(
  credential: PublicKeyCredential,
  transports: AuthenticatorTransport[] | undefined,
): string {
  const response = credential.response as AuthenticatorAttestationResponse;
  const authData = response.getAuthenticatorData?.();
  return authenticatorLabel({
    aaguid: aaguidFromAuthData(authData),
    transports,
    // biome-ignore lint/suspicious/noExplicitAny: authenticatorAttachment isn't on the lib.dom type
    attachment: (credential as any).authenticatorAttachment,
  });
}

function descriptor(ref: CredentialRef): PublicKeyCredentialDescriptor {
  return {
    id: base64urlToBytes(ref.id),
    type: "public-key",
    ...(ref.transports ? { transports: ref.transports } : {}),
  };
}

/**
 * Register an authenticator and encrypt `password` with its PRF secret. No
 * `authenticatorAttachment` is pinned, so platform and roaming authenticators
 * both qualify. `existing` is passed as excludeCredentials so the same
 * authenticator can't be enrolled twice. Throws a {@link PasskeyError} on cancel,
 * a duplicate, or when the chosen authenticator can't produce a PRF secret.
 */
export async function enrollPasskeyCredential(
  password: string,
  existing: PasskeyCredential[] = [],
): Promise<PasskeyCredential> {
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
        excludeCredentials: existing.map((c) =>
          descriptor({ id: c.credentialId, transports: c.transports }),
        ),
        timeout: CEREMONY_TIMEOUT_MS,
        attestation: "none",
        // biome-ignore lint/suspicious/noExplicitAny: PRF/credProps inputs aren't in lib.dom yet
        extensions: { prf: { eval: { first: PRF_SALT } }, credProps: true } as any,
      },
    })) as PublicKeyCredential | null;
  } catch (error) {
    if (error instanceof DOMException && error.name === "InvalidStateError") {
      throw new PasskeyError(
        "already-enrolled",
        "This authenticator is already registered — use it to unlock, or add a different one.",
      );
    }
    throw new PasskeyError("cancelled", asCancelMessage(error));
  }

  if (!created) throw new PasskeyError("cancelled", "Passkey enrollment was cancelled.");
  const credentialId = bytesToBase64url(created.rawId);
  const transports = transportsOf(created.response as AuthenticatorAttestationResponse);
  // credProps.rk === true → a discoverable/synced passkey (iCloud, Google, …).
  // biome-ignore lint/suspicious/noExplicitAny: credProps isn't in lib.dom yet
  const discoverable = (created.getClientExtensionResults() as any)?.credProps?.rk === true;

  // Some authenticators return the PRF result from create(); others only from a
  // follow-up get(). Try create() first, then fall back to an assertion.
  let secret = prfResult(created);
  if (!secret) {
    secret = (await assertPrfSecret([{ id: credentialId, transports }])).secret;
  }
  if (!secret) {
    throw new PasskeyError(
      "no-prf",
      "That passkey can't be used for unlock — it doesn't support the secure-unlock (PRF) extension. Use this device's built-in biometrics or a security key, and disable passkey handling in your password manager if it intercepted this.",
    );
  }

  return {
    credentialId,
    label: labelFor(created, transports),
    encrypted: await encryptWithSecret(secret, password),
    createdAt: new Date().toISOString(),
    ...(transports ? { transports } : {}),
    ...(discoverable ? { discoverable: true } : {}),
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
  credentials: CredentialRef[],
): Promise<{ secret?: ArrayBuffer; credentialId?: string }> {
  if (!credentials.length) return {};
  // Per-credential PRF salts — every enrolled credential evaluates the same app
  // salt, so whichever one the user taps yields its decryption secret.
  const evalByCredential: Record<string, { first: BufferSource }> = {};
  for (const c of credentials) evalByCredential[c.id] = { first: PRF_SALT };

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: credentials.map(descriptor),
      userVerification: "required",
      timeout: CEREMONY_TIMEOUT_MS,
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
  const refs = enrollment.credentials.map((c) => ({
    id: c.credentialId,
    transports: c.transports,
  }));
  let result: { secret?: ArrayBuffer; credentialId?: string };
  try {
    result = await assertPrfSecret(refs);
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

/**
 * Best-effort: tell the OS / passkey provider that a credential we removed is no
 * longer valid here, so it can prune its own copy (WebAuthn L3 signal API).
 * No-op where unsupported; never throws.
 */
export async function signalPasskeyRemoved(credentialId: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    // biome-ignore lint/suspicious/noExplicitAny: signal* methods aren't in lib.dom yet
    const signal = (window.PublicKeyCredential as any)?.signalUnknownCredential;
    if (typeof signal !== "function") return;
    await signal({ rpId: window.location.hostname, credentialId });
  } catch {
    // provider cleanup is a nicety — never let it block or surface on remove
  }
}
