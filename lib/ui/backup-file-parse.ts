// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

/**
 * Engine-free bounded pre-read for picked wallet backup files, mirroring the
 * conceal-wallet-sdk `parseEncryptedWalletJson` gate.
 *
 * @see docs/decisions/002-bounded-backup-file-pick.md
 */

/** Mirrors conceal-wallet-sdk MAX_ENVELOPE_JSON_CHARS. */
const MAX_JSON_CHARS = 33_554_432;
/** Mirrors conceal-wallet-sdk MAX_ENVELOPE_TEXT_CHARS (4 × MAX_JSON_CHARS). */
const MAX_TEXT_CHARS = 4 * MAX_JSON_CHARS;

export type WalletBackupFileCheck = "ok" | "invalid-json" | "too-large";

/** Whether `text` has more than `max` non-whitespace (JSON insignificant) chars. */
function exceedsJsonChars(text: string, max: number): boolean {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c !== 0x20 && c !== 0x0a && c !== 0x0d && c !== 0x09 && ++count > max) return true;
  }
  return false;
}

/**
 * Byte-size check to run before reading the file.
 *
 * @see docs/decisions/002-bounded-backup-file-pick.md
 */
export function isBackupFileTooLarge(byteSize: number): boolean {
  return byteSize > MAX_TEXT_CHARS;
}

/**
 * Same gate as the SDK's `parseEncryptedWalletJson`, but distinguishes
 * "too large" from "not valid JSON".
 *
 * @see docs/decisions/002-bounded-backup-file-pick.md
 */
export function checkWalletBackupText(text: string): WalletBackupFileCheck {
  if (typeof text !== "string" || text.length > MAX_TEXT_CHARS) return "too-large";
  const body = text.replace(/^\uFEFF/, "").trim();
  if (exceedsJsonChars(body, MAX_JSON_CHARS)) return "too-large";
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return "invalid-json";
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return "invalid-json";
  }
  return "ok";
}
