/**
 * Persistence for passkey unlock enrollments (Touch ID / Windows Hello / security
 * keys / phone passkeys — anything exposing the WebAuthn PRF extension).
 *
 * Stored in localStorage as an envelope of one-or-more registered authenticators
 * for the current wallet. Each entry holds an AES-GCM ciphertext of the wallet
 * password encrypted under that authenticator's PRF secret — useless without a
 * user-verifying assertion from the matching authenticator. Cleared on wallet
 * delete, password change, panic wipe, and when a different wallet opens.
 *
 * v1 (single-credential) enrollments are migrated to the v2 envelope on read; the
 * ciphertext is unchanged, so existing enrollments keep working.
 */
import type { EncryptedSecret } from "@/lib/auth/webauthn-crypto";

const STORAGE_KEY = "ccx-biometric-enrollment";

export interface PasskeyCredential {
  /** base64url credential id, listed in allowCredentials on unlock. */
  credentialId: string;
  /** User-facing name, e.g. "This device" or "Security key or phone". */
  label: string;
  /** Wallet password encrypted under this credential's PRF secret. */
  encrypted: EncryptedSecret;
  /** ISO timestamp the credential was registered; "" for migrated v1 entries. */
  createdAt: string;
}

export interface PasskeyEnrollment {
  version: 2;
  /** Wallet address these credentials unlock. Lets the app drop a stale
   *  enrollment when a different wallet is opened (import / re-create). */
  address?: string;
  credentials: PasskeyCredential[];
}

function isCredentialShape(
  value: unknown,
): value is { credentialId: string; encrypted: EncryptedSecret } {
  const c = value as { credentialId?: unknown; encrypted?: { iv?: unknown; ciphertext?: unknown } };
  return Boolean(
    c &&
      typeof c.credentialId === "string" &&
      c.credentialId &&
      typeof c.encrypted?.iv === "string" &&
      typeof c.encrypted?.ciphertext === "string",
  );
}

/** Read + migrate the stored enrollment, or null if none/invalid. */
export function getPasskeyEnrollment(): PasskeyEnrollment | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const address = typeof parsed?.address === "string" ? parsed.address : undefined;

    // v2 envelope.
    if (parsed?.version === 2 && Array.isArray(parsed.credentials)) {
      const mapped = parsed.credentials.filter(isCredentialShape).map((c) => {
        const entry = c as PasskeyCredential;
        return {
          credentialId: entry.credentialId,
          label: typeof entry.label === "string" && entry.label ? entry.label : "Passkey",
          encrypted: entry.encrypted,
          createdAt: typeof entry.createdAt === "string" ? entry.createdAt : "",
        };
      });
      // De-dupe by id on read too (write already dedupes) — a duplicate id would
      // otherwise let find() pick the wrong entry on unlock.
      const seen = new Set<string>();
      const credentials = mapped.filter((c) => {
        if (seen.has(c.credentialId)) return false;
        seen.add(c.credentialId);
        return true;
      });
      return credentials.length ? { version: 2, address, credentials } : null;
    }

    // v1 single-credential → migrate to the envelope (same ciphertext).
    if (isCredentialShape(parsed)) {
      return {
        version: 2,
        address,
        credentials: [
          {
            credentialId: parsed.credentialId,
            label: "This device",
            encrypted: parsed.encrypted,
            createdAt: "",
          },
        ],
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function savePasskeyEnrollment(enrollment: PasskeyEnrollment): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(enrollment));
  } catch {
    // storage unavailable — passkey unlock just won't persist
  }
}

export function clearPasskeyEnrollment(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // best-effort
  }
}

export function hasPasskeyEnrollment(): boolean {
  return getPasskeyEnrollment() !== null;
}

/**
 * Append a credential immutably, de-duping by credentialId. If `address` differs
 * from the existing enrollment's wallet, the old credentials are dropped (they
 * belong to a different wallet and can't decrypt this password).
 */
export function addPasskeyCredential(
  existing: PasskeyEnrollment | null,
  credential: PasskeyCredential,
  address: string | undefined,
): PasskeyEnrollment {
  const sameWallet = existing && (!address || !existing.address || existing.address === address);
  const kept = sameWallet
    ? existing.credentials.filter((c) => c.credentialId !== credential.credentialId)
    : [];
  return {
    version: 2,
    address: address ?? existing?.address,
    credentials: [...kept, credential],
  };
}

/** Remove a credential by id; returns the new enrollment, or null when empty. */
export function removePasskeyCredential(
  enrollment: PasskeyEnrollment,
  credentialId: string,
): PasskeyEnrollment | null {
  const credentials = enrollment.credentials.filter((c) => c.credentialId !== credentialId);
  return credentials.length ? { ...enrollment, credentials } : null;
}
