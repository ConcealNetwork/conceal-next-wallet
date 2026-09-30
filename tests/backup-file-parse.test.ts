// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkWalletBackupText } from "@/lib/ui/backup-file-parse";

/**
 * The import form's pre-read helper must stay in lockstep with the SDK's
 * bounded envelope gate (parseEncryptedWalletJson) — same caps, same accept /
 * reject decisions — so a file the SDK would import is never rejected at the
 * form, and a file the SDK would reject never reaches an unbounded parse.
 */
describe("checkWalletBackupText parity with parseEncryptedWalletJson", () => {
  const ENVELOPE = JSON.stringify({
    envelope: 3,
    kdf: { alg: "argon2id", v: 19, m: 65536, t: 2, p: 1, salt: "ab".repeat(16) },
    nonce: "cd".repeat(12),
    data: [1, 2, 3],
  });

  it("accepts a valid envelope, incl. BOM + surrounding whitespace", async () => {
    const { parseEncryptedWalletJson } = await import("conceal-wallet-sdk");
    for (const text of [ENVELOPE, `\uFEFF${ENVELOPE}`, `  \n${ENVELOPE}\n  `]) {
      expect(checkWalletBackupText(text)).toBe("ok");
      expect(parseEncryptedWalletJson(text)).not.toBeNull();
    }
  });

  it("rejects non-JSON and non-object JSON exactly like the SDK gate", async () => {
    const { parseEncryptedWalletJson } = await import("conceal-wallet-sdk");
    for (const text of [
      "{oops",
      "[1,2,3]",
      "42",
      '"a string"',
      "null",
      "true",
      "",
      "   ",
    ]) {
      expect(checkWalletBackupText(text)).toBe("invalid-json");
      expect(parseEncryptedWalletJson(text)).toBeNull();
    }
  });

  it("rejects text over the non-whitespace JSON char cap exactly like the SDK gate", async () => {
    const { parseEncryptedWalletJson, MAX_ENVELOPE_JSON_CHARS, MAX_ENVELOPE_TEXT_CHARS } =
      await import("conceal-wallet-sdk");
    const padded = `{"a":"${"x".repeat(MAX_ENVELOPE_JSON_CHARS + 1)}"}`;
    expect(checkWalletBackupText(padded)).toBe("too-large");
    expect(parseEncryptedWalletJson(padded)).toBeNull();
    // Whitespace is free for the char cap but still bounded by the raw-length cap.
    const sparse = `${" ".repeat(MAX_ENVELOPE_TEXT_CHARS)}${ENVELOPE}`;
    expect(checkWalletBackupText(sparse)).toBe("too-large");
    expect(parseEncryptedWalletJson(sparse)).toBeNull();
  });

  it("still accepts a tens-of-MB realistic wallet backup (cap headroom, not a size wall)", async () => {
    const { parseEncryptedWalletJson } = await import("conceal-wallet-sdk");
    // A few MB of pretty-printed envelope: well within the gate.
    const pretty = `${JSON.stringify({ envelope: 3, kdf: {}, nonce: "", data: [] }, null, 2).slice(0, -2)},"data": [${"1,".repeat(1_000_000)}1]}`;
    expect(checkWalletBackupText(pretty)).toBe("ok");
    expect(parseEncryptedWalletJson(pretty)).not.toBeNull();
  });

  it("keeps its caps in sync with the SDK constants", async () => {
    const sdk = await import("conceal-wallet-sdk");
    // Mirrored in lib/ui/backup-file-parse.ts (engine-free by design).
    expect(sdk.MAX_ENVELOPE_JSON_CHARS).toBe(33_554_432);
    expect(sdk.MAX_ENVELOPE_TEXT_CHARS).toBe(4 * 33_554_432);
  });
});
