import { beforeEach, describe, expect, it } from "vitest";
import { bytesToBase64url } from "@/lib/auth/webauthn-crypto";
import { createTxNotesStore, inMemoryTxNotesBackend, txNotes } from "@/lib/storage/tx-notes";
import {
  buildVaultFile,
  openVaultFile,
  parseVaultFile,
  restoreVaultData,
} from "@/lib/storage/vault";
import { decryptVault, encryptVault } from "@/lib/storage/vault-crypto";

describe("vault-crypto", () => {
  it("round-trips plaintext through password encryption", async () => {
    const encrypted = await encryptVault('{"hello":"world"}', "correct horse");
    expect(encrypted.ciphertext).not.toContain("hello");
    expect(await decryptVault(encrypted, "correct horse")).toBe('{"hello":"world"}');
  });

  it("rejects a wrong password", async () => {
    const encrypted = await encryptVault("secret", "right");
    await expect(decryptVault(encrypted, "wrong")).rejects.toThrow(/wrong password|corrupt/i);
  });

  it("rejects a tampered ciphertext", async () => {
    const encrypted = await encryptVault("secret", "pw");
    const tampered = { ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -2)}AA` };
    await expect(decryptVault(tampered, "pw")).rejects.toThrow();
  });

  it("encrypts new backups at the current OWASP iteration count (>= 600k)", async () => {
    const encrypted = await encryptVault("secret", "pw");
    expect(encrypted.iterations).toBeGreaterThanOrEqual(600_000);
  });

  it("still decrypts an OLD backup made at 210k iterations (back-compat)", async () => {
    // Build a 210k envelope the way the old code would have: derive the key at
    // 210k, encrypt, and stamp iterations:210000. decrypt must honor the stored
    // count, not the new constant.
    const password = "legacy-pw";
    const plaintext = '{"legacy":true}';
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const baseKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 210_000, hash: "SHA-256" },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    );
    const oldEnvelope = {
      v: 1 as const,
      kdf: "PBKDF2-SHA256" as const,
      iterations: 210_000,
      salt: bytesToBase64url(salt),
      iv: bytesToBase64url(iv),
      ciphertext: bytesToBase64url(ciphertext),
    };

    expect(await decryptVault(oldEnvelope, password)).toBe(plaintext);
  });

  it("maps malformed base64 to the friendly error (not a raw throw)", async () => {
    const encrypted = await encryptVault("secret", "pw");
    // `!` is not a base64url char → atob throws InvalidCharacterError. The decode
    // now lives inside the try, so it must surface as the friendly message.
    const corruptSalt = { ...encrypted, salt: "!!!not-base64!!!" };
    await expect(decryptVault(corruptSalt, "pw")).rejects.toThrow(/wrong password|corrupt/i);

    const corruptCiphertext = { ...encrypted, ciphertext: "@@@nope@@@" };
    await expect(decryptVault(corruptCiphertext, "pw")).rejects.toThrow(/wrong password|corrupt/i);
  });
});

describe("tx-notes export/import", () => {
  it("exports every note and re-imports them (replace)", async () => {
    const store = createTxNotesStore(inMemoryTxNotesBackend({ a: "note a", b: "note b" }));
    expect(await store.exportNotes()).toEqual({ a: "note a", b: "note b" });

    const target = createTxNotesStore(inMemoryTxNotesBackend({ stale: "old" }));
    const written = await target.importNotes({ a: "note a", b: "note b" }, "replace");
    expect(written).toBe(2);
    expect(await target.exportNotes()).toEqual({ a: "note a", b: "note b" }); // 'stale' cleared
  });

  it("merge keeps existing notes and only adds new hashes", async () => {
    const store = createTxNotesStore(inMemoryTxNotesBackend({ a: "mine" }));
    const written = await store.importNotes({ a: "incoming", b: "new" }, "merge");
    expect(written).toBe(1); // only 'b' added; 'a' preserved
    expect(await store.exportNotes()).toEqual({ a: "mine", b: "new" });
  });
});

describe("vault build → parse → open → restore", () => {
  beforeEach(async () => {
    await txNotes.clearAll();
    localStorage.clear();
  });

  it("round-trips notes + allowlisted prefs through an encrypted file", async () => {
    await txNotes.setNote("hashA", "rent payment");
    localStorage.setItem("ccx-theme", "dark");
    localStorage.setItem("ccx-locale", "es");
    localStorage.setItem("useShortTicker", "true"); // canonical ticker store — must travel
    localStorage.setItem("not-allowlisted", "should-not-travel");

    const file = await buildVaultFile("pw123", "2026-06-17T00:00:00.000Z");

    // Simulate a fresh device: wipe everything.
    await txNotes.clearAll();
    localStorage.clear();

    const data = await openVaultFile(parseVaultFile(JSON.stringify(file)), "pw123");
    const result = await restoreVaultData(data, { mergeNotes: false });

    expect(result.notes).toBe(1);
    expect(await txNotes.getNote("hashA")).toBe("rent payment");
    expect(localStorage.getItem("ccx-theme")).toBe("dark");
    expect(localStorage.getItem("ccx-locale")).toBe("es");
    expect(localStorage.getItem("useShortTicker")).toBe("true");
    // The non-allowlisted key was never captured.
    expect(localStorage.getItem("not-allowlisted")).toBeNull();
  });

  it("fails to open with the wrong password", async () => {
    const file = await buildVaultFile("right", "2026-06-17T00:00:00.000Z");
    // Go through the full load path (parse → open) for consistency.
    const parsed = parseVaultFile(JSON.stringify(file));
    await expect(openVaultFile(parsed, "nope")).rejects.toThrow(/wrong password|corrupt/i);
  });

  it("rejects a file that isn't a Conceal vault", () => {
    expect(() => parseVaultFile('{"app":"something-else"}')).toThrow(/Conceal local-data backup/i);
    expect(() => parseVaultFile("not json")).toThrow(/not JSON/i);
  });
});
