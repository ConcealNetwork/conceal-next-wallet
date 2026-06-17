import { beforeEach, describe, expect, it } from "vitest";
import { createTxNotesStore, inMemoryTxNotesBackend, txNotes } from "@/lib/storage/tx-notes";
import { decryptVault, encryptVault } from "@/lib/storage/vault-crypto";
import { buildVaultFile, openVaultFile, parseVaultFile, restoreVaultData } from "@/lib/storage/vault";

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
    // The non-allowlisted key was never captured.
    expect(localStorage.getItem("not-allowlisted")).toBeNull();
  });

  it("fails to open with the wrong password", async () => {
    const file = await buildVaultFile("right", "2026-06-17T00:00:00.000Z");
    await expect(openVaultFile(file, "nope")).rejects.toThrow(/wrong password|corrupt/i);
  });

  it("rejects a file that isn't a Conceal vault", () => {
    expect(() => parseVaultFile('{"app":"something-else"}')).toThrow(/Conceal local-data backup/i);
    expect(() => parseVaultFile("not json")).toThrow(/not JSON/i);
  });
});
