/**
 * Crypto primitives for biometric unlock — kept separate from the WebAuthn
 * ceremony so they're pure and unit-testable. The wallet password is encrypted
 * with AES-GCM using a 32-byte secret derived from the platform authenticator's
 * WebAuthn PRF output (see webauthn-prf.ts); only a successful biometric
 * assertion can reproduce that secret, so the stored ciphertext is useless on
 * its own.
 */

/** Fixed application salt fed to the PRF — must never change or stored
 *  ciphertexts become undecryptable. */
export const PRF_SALT = new TextEncoder().encode("conceal-wallet/biometric-unlock/v1");

export interface EncryptedSecret {
  /** base64url of the 12-byte AES-GCM IV. */
  iv: string;
  /** base64url of the ciphertext (+ GCM tag). */
  ciphertext: string;
}

export function bytesToBase64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  // Allocate over an explicit ArrayBuffer so the result is a BufferSource
  // (Uint8Array<ArrayBuffer>), accepted by WebCrypto + WebAuthn APIs.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function aesKeyFromSecret(secret: ArrayBuffer): Promise<CryptoKey> {
  const view = new Uint8Array(secret);
  // Copy into a fresh ArrayBuffer so importKey accepts the key material in
  // jsdom tests (Node's SubtleCrypto rejects jsdom-realm ArrayBuffers).
  const keyBytes = new Uint8Array(new ArrayBuffer(view.byteLength));
  keyBytes.set(view);
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypt a plaintext (the wallet password) with a PRF-derived secret. */
export async function encryptWithSecret(
  secret: ArrayBuffer,
  plaintext: string,
): Promise<EncryptedSecret> {
  const key = await aesKeyFromSecret(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { iv: bytesToBase64url(iv), ciphertext: bytesToBase64url(ciphertext) };
}

/** Decrypt with a PRF-derived secret; throws if the secret/ciphertext don't match. */
export async function decryptWithSecret(
  secret: ArrayBuffer,
  encrypted: EncryptedSecret,
): Promise<string> {
  const key = await aesKeyFromSecret(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64urlToBytes(encrypted.iv) },
    key,
    base64urlToBytes(encrypted.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}
