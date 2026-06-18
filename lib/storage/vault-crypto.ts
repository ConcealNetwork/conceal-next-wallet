import { base64urlToBytes, bytesToBase64url } from "@/lib/auth/webauthn-crypto";

/**
 * Password-based encryption for the local-data vault, using Web Crypto only (no
 * `wallet-core` import). PBKDF2-SHA256 derives an AES-GCM key from the password;
 * a fresh random salt + IV are stored alongside the ciphertext. Wrong password →
 * AES-GCM authentication fails and decrypt throws.
 */

// OWASP guidance for PBKDF2-HMAC-SHA256 is 600,000 iterations (the 210k figure
// is for SHA-512). New backups use this; old backups still decrypt because
// decrypt reads `payload.iterations` from the stored envelope.
const PBKDF2_ITERATIONS = 600_000;
// Sane clamp for the iteration count read from an (untrusted) backup file:
// below the floor weakens the KDF, above the ceiling is a CPU-DoS vector.
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 10_000_000;
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
  // Clamp the (untrusted) iteration count to a sane range so a malicious backup
  // can't drive a CPU-DoS via an absurd value (or weaken the KDF with a tiny one).
  const iterations = Math.min(Math.max(payload.iterations, MIN_ITERATIONS), MAX_ITERATIONS);
  let plaintext: ArrayBuffer;
  try {
    // base64url decodes live inside the try so malformed input (a hand-corrupted
    // backup) maps to the friendly error below instead of a raw InvalidCharacterError.
    const key = await deriveKey(password, base64urlToBytes(payload.salt), iterations);
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
