import { describe, expect, it } from "vitest";
import {
  base64urlToBytes,
  bytesToBase64url,
  decryptWithSecret,
  encryptWithSecret,
} from "@/lib/auth/webauthn-crypto";

function secret(seed: number): ArrayBuffer {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) bytes[i] = (seed + i) % 256;
  return bytes.buffer;
}

describe("base64url", () => {
  it("round-trips arbitrary bytes (incl. those that need - and _)", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 62, 63, 64]);
    expect([...base64urlToBytes(bytesToBase64url(bytes))]).toEqual([...bytes]);
  });

  it("emits url-safe output with no padding", () => {
    const encoded = bytesToBase64url(new Uint8Array([255, 255, 255, 255]));
    expect(encoded).not.toMatch(/[+/=]/);
  });
});

describe("encryptWithSecret / decryptWithSecret", () => {
  it("round-trips a password", async () => {
    const enc = await encryptWithSecret(secret(1), "correct horse battery staple");
    expect(await decryptWithSecret(secret(1), enc)).toBe("correct horse battery staple");
  });

  it("uses a fresh random IV each time (different ciphertext for same input)", async () => {
    const a = await encryptWithSecret(secret(2), "same");
    const b = await encryptWithSecret(secret(2), "same");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("fails to decrypt with the wrong secret (authenticated encryption)", async () => {
    const enc = await encryptWithSecret(secret(3), "secret-password");
    await expect(decryptWithSecret(secret(99), enc)).rejects.toBeDefined();
  });

  it("handles unicode passwords", async () => {
    const pw = "пароль🔐密码";
    expect(await decryptWithSecret(secret(4), await encryptWithSecret(secret(4), pw))).toBe(pw);
  });
});
