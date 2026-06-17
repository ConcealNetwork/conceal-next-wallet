import { base64urlToBytes, bytesToBase64url } from "@/lib/auth/webauthn-crypto";

/**
 * Password-based encryption for the local-data vault, using Web Crypto only (no
 * `wallet-core` import). PBKDF2-SHA256 derives an AES-GCM key from the password;
 * a fresh random salt + IV are stored alongside the ciphertext. Wrong password →
 * AES-GCM authentication fails and decrypt throws.
 */

const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface EncryptedVault {
  /** Envelope format version (distinct from the vault payload version). */
  v: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  /** base64url of the PBKDF2 salt. */
  salt: string;
  /** base64url of the AES-GCM IV. */
  iv: string;
  /** base64url of the AES-GCM ciphertext (+ tag). */
  ciphertext: string;
}

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptVault(plaintext: string, password: string): Promise<EncryptedVault> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    v: 1,
    kdf: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64url(salt),
    iv: bytesToBase64url(iv),
    ciphertext: bytesToBase64url(ciphertext),
  };
}

/** Decrypt a vault. Throws on a wrong password or tampered/corrupt payload. */
export async function decryptVault(payload: EncryptedVault, password: string): Promise<string> {
  if (payload.v !== 1 || payload.kdf !== "PBKDF2-SHA256") {
    throw new Error("Unsupported vault format.");
  }
  const key = await deriveKey(password, base64urlToBytes(payload.salt), payload.iterations);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64urlToBytes(payload.iv) },
      key,
      base64urlToBytes(payload.ciphertext),
    );
  } catch {
    throw new Error("Wrong password or corrupt backup file.");
  }
  return new TextDecoder().decode(plaintext);
}
