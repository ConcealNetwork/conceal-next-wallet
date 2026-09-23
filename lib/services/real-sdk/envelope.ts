// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

/**
 * Typed wallet-envelope boundary for the real SDK engine.
 *
 * Ciphertext open/save and mnemonic hygiene go through these SDK helpers —
 * never ad-hoc `JSON.parse` on wallet blobs. Callers MUST `await ensureSdkReady()`
 * before the first crypto use of open/save helpers.
 */
export {
  MAX_ENVELOPE_JSON_CHARS,
  omitMnemonic,
  openEncryptedWallet,
  openStoredWallet,
  parseEncryptedWalletJson,
  saveEncryptedWallet,
  saveStoredWallet,
} from "conceal-wallet-sdk";
