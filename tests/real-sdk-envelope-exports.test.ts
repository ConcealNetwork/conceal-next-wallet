// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

// @vitest-environment node
import { describe, expect, it } from "vitest";

/**
 * Locks the typed Envelope-3 boundary symbols into the real-sdk import surface.
 * Production modules that touch ciphertext import these via
 * `@/lib/services/real-sdk/envelope` (re-exported from conceal-wallet-sdk ≥0.3.0).
 */
describe("real-sdk envelope typed exports", () => {
  it("exposes parse/open/save helpers, omitMnemonic, and MAX_ENVELOPE_JSON_CHARS", async () => {
    const {
      parseEncryptedWalletJson,
      openEncryptedWallet,
      saveEncryptedWallet,
      openStoredWallet,
      saveStoredWallet,
      omitMnemonic,
      MAX_ENVELOPE_JSON_CHARS,
    } = await import("@/lib/services/real-sdk/envelope");

    expect(typeof parseEncryptedWalletJson).toBe("function");
    expect(typeof openEncryptedWallet).toBe("function");
    expect(typeof saveEncryptedWallet).toBe("function");
    expect(typeof openStoredWallet).toBe("function");
    expect(typeof saveStoredWallet).toBe("function");
    expect(typeof omitMnemonic).toBe("function");
    expect(typeof MAX_ENVELOPE_JSON_CHARS).toBe("number");
    expect(MAX_ENVELOPE_JSON_CHARS).toBeGreaterThan(0);
  });

  it("matches the same named exports on conceal-wallet-sdk", async () => {
    const sdk = await import("conceal-wallet-sdk");
    expect(typeof sdk.parseEncryptedWalletJson).toBe("function");
    expect(typeof sdk.openEncryptedWallet).toBe("function");
    expect(typeof sdk.saveEncryptedWallet).toBe("function");
    expect(typeof sdk.openStoredWallet).toBe("function");
    expect(typeof sdk.saveStoredWallet).toBe("function");
    expect(typeof sdk.omitMnemonic).toBe("function");
    expect(typeof sdk.MAX_ENVELOPE_JSON_CHARS).toBe("number");
  });
});
