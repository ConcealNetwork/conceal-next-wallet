/**
 * Persistence for passkey unlock enrollments (Touch ID / Windows Hello / security
 * keys / phone passkeys — anything exposing the WebAuthn PRF extension).
 *
 * Stored in localStorage as an envelope of one-or-more registered authenticators
 * for a SPECIFIC wallet. Each entry holds an AES-GCM ciphertext of THAT wallet's
 * password encrypted under the authenticator's PRF secret — useless without a
 * user-verifying assertion from the matching authenticator. Cleared on wallet
 * delete, password change, panic wipe, and when a different wallet opens.
 *
 * MULTI-WALLET (#95): a passkey encrypts ONE wallet's password, so enrollments are
 * keyed per wallet id — `ccx-biometric-enrollment:<walletId>`. The legacy GLOBAL
 * key (`ccx-biometric-enrollment`, single-wallet) is migrated on first read to the
 * default wallet id, so an existing enrollment keeps working seamlessly.
 *
 * v1 (single-credential) enrollments are migrated to the v2 envelope on read; the
 * ciphertext is unchanged, so existing enrollments keep working.
 */
import type { EncryptedSecret } from "@/lib/auth/webauthn-crypto";

/** Legacy GLOBAL storage key (pre-multi-wallet). Migrated to the default id. */
const LEGACY_STORAGE_KEY = "ccx-biometric-enrollment";
/** The default wallet id (mirrors `real-sdk/wallets-index` `DEFAULT_WALLET_ID`,
 *  duplicated here to keep this mode-agnostic store free of engine imports). */
export const DEFAULT_WALLET_ID = "default";

/** Per-wallet storage key. The default wallet inherits the legacy global key. */
function storageKeyFor(walletId: string): string {
  return walletId === DEFAULT_WALLET_ID
    ? LEGACY_STORAGE_KEY
    : `${LEGACY_STORAGE_KEY}:${walletId}`;
}

export interface PasskeyCredential {
  /** base64url credential id, listed in allowCredentials on unlock. */
  credentialId: string;
  /** User-facing name, e.g. "iCloud Keychain", "This device", or a custom rename. */
  label: string;
  /** Wallet password encrypted under this credential's PRF secret. */
  encrypted: EncryptedSecret;
  /** ISO timestamp the credential was registered; "" for migrated v1 entries. */
  createdAt: string;
  /** Authenticator transports (from getTransports()) — passed in allowCredentials
   *  on unlock for correct/faster routing. Absent for migrated v1 entries. */
  transports?: AuthenticatorTransport[];
  /** credProps.rk — true for a discoverable/synced passkey (iCloud, Google, …). */
  discoverable?: boolean;
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

/** Read + migrate the stored enrollment for `walletId`, or null if none/invalid. */
export function getPasskeyEnrollment(
  walletId: string = DEFAULT_WALLET_ID,
): PasskeyEnrollment | null {
  try {
    const raw = localStorage.getItem(storageKeyFor(walletId));
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
          ...(Array.isArray(entry.transports) ? { transports: entry.transports } : {}),
          ...(entry.discoverable === true ? { discoverable: true as const } : {}),
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

export function savePasskeyEnrollment(
  enrollment: PasskeyEnrollment,
  walletId: string = DEFAULT_WALLET_ID,
): void {
  try {
    localStorage.setItem(storageKeyFor(walletId), JSON.stringify(enrollment));
  } catch {
    // storage unavailable — passkey unlock just won't persist
  }
}

export function clearPasskeyEnrollment(walletId: string = DEFAULT_WALLET_ID): void {
  try {
    localStorage.removeItem(storageKeyFor(walletId));
  } catch {
    // best-effort
  }
}

export function hasPasskeyEnrollment(walletId: string = DEFAULT_WALLET_ID): boolean {
  return getPasskeyEnrollment(walletId) !== null;
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

/** Rename a credential immutably; a blank label falls back to "Passkey". */
export function renamePasskeyCredential(
  enrollment: PasskeyEnrollment,
  credentialId: string,
  label: string,
): PasskeyEnrollment {
  const next = label.trim() || "Passkey";
  return {
    ...enrollment,
    credentials: enrollment.credentials.map((c) =>
      c.credentialId === credentialId ? { ...c, label: next } : c,
    ),
  };
}
