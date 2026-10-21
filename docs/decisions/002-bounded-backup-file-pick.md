# 002 — Bounded pre-read for picked wallet backup files

Status: **Accepted**  
Date: 2026-10-20

## Context

`ImportFileForm` validated a picked backup on select with a plain
`JSON.parse` on the main thread, bypassing the SDK's size-gated
`parseEncryptedWalletJson`. A mis-picked huge JSON could freeze the tab (or an
Android WebView) before any error showed. Reading the file
(`arrayBuffer()` + `TextDecoder`) is itself unbounded, so a text-only gate
still loads a multi-GB pick into memory first.

The import form is shared by mock and real mode, so it cannot import the
engine (`conceal-wallet-sdk`) just to reuse its gate.

## Decision

`lib/ui/backup-file-parse.ts` (engine-free) gates the pick in two steps:

1. **`isBackupFileTooLarge(file.size)` — before reading.** Rejects any file over
   `MAX_ENVELOPE_TEXT_CHARS` bytes. Bytes are a safe stand-in for the SDK's
   text-length cap: wallet backups are ASCII JSON (one byte per char), and a
   UTF-8 file never has fewer bytes than UTF-16 code units, so every genuine
   backup the SDK would accept passes.
2. **`checkWalletBackupText(text)` — after reading.** Same gate as
   `parseEncryptedWalletJson` (BOM strip + trim, raw text-length cap,
   non-whitespace JSON char cap, parse, plain-object check), but returns
   `"too-large"` vs `"invalid-json"` so the form can show an accurate message.

The form shows one fixed toast per outcome (too large / not valid JSON / could
not be read) and never surfaces raw browser error text.

### Also applies to: local-data vault restore

The Settings vault restore picker (`components/wallet/vault-backup.tsx`) had the
same unbounded read + `JSON.parse`. It now goes through `readVaultFile(file)` in
`lib/storage/vault.ts`: reject over `MAX_VAULT_FILE_BYTES` (32 MiB) before
reading, map a read failure to a friendly message, then `parseVaultFile`.

The vault gets its own, smaller cap instead of the SDK's: a vault holds only
transaction notes (≤ 280 chars each) and a few allowlisted preferences, so even
tens of thousands of max-length multibyte notes, encrypted and base64-encoded,
stay well under 32 MiB.

## Consequences

- Oversized picks are rejected instantly, without reading the file.
- Picks within the caps still parse on the main thread — same cost as the SDK's
  own import-time parse, which real backups (tested up to a 48 MB export) pay
  anyway.
- The caps are **copies** of the SDK's `MAX_ENVELOPE_JSON_CHARS` /
  `MAX_ENVELOPE_TEXT_CHARS`. `tests/backup-file-parse.test.ts` asserts parity
  with the SDK gate and its constants; an SDK bump that changes them must
  update both together.

## Alternatives considered

- **Import `parseEncryptedWalletJson` from the SDK.** Rejected: pulls the engine
  into mock mode and the onboarding bundle.
- **Text-only gate (no byte pre-check).** Rejected: the read + decode is the
  unbounded step on a huge pick.
- **Parse in a Web Worker.** Rejected for now: more moving parts than the
  failure mode warrants once the size gate rejects huge picks up front.
