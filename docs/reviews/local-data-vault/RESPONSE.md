# Encrypted device-data vault — review notes

Feature #2 from the multi-agent brainstorm: a password-encrypted, portable backup of device-local metadata (transaction notes + an allowlist of UI prefs) so users can move it between browsers without re-importing the seed.

## Review

- **CodeRabbit** — 1 finding (rated "critical", actually a test-consistency nit): the wrong-password test passed the `VaultFile` object straight to `openVaultFile` instead of going through `parseVaultFile` first. Applied — the test now exercises the full parse → open path. No production-code issue.
- **Antigravity (Gemini 3.1 Pro)** — completed with no findings.
- **Codex** — out of credits this run (produced no output).

## Self-review of the crypto (the highest-stakes part)

- `vault-crypto.ts` reuses the exact AES-GCM + base64url pattern already shipped and reviewed in `webauthn-crypto.ts` (#50). PBKDF2-SHA256 @ 210k iterations derives a non-extractable AES-GCM key; a **fresh random salt + IV per encrypt** (no nonce reuse). Wrong password → AES-GCM auth failure → `decryptVault` throws (tested).
- **Iteration "downgrade" via the stored `iterations` field is not a practical attack:** the file is the encryptor's own ciphertext, and a lower KDF cost only weakens protection of *that* file (the attacker's). Decryption still requires the correct password, and AES-GCM guarantees integrity. The `kdf`/`v` fields are validated and a mismatch is rejected.
- **No key leakage:** the allowlist (`useShortTicker`, `ccx-theme`, `ccx-locale`) is explicit — the export never dumps arbitrary localStorage, never touches the encrypted `"wallet"` IndexedDB key or biometric enrollment. A test asserts a non-allowlisted localStorage key does not travel.
- **Fail-safe import:** `parseVaultFile` validates app/kind/shape before any decryption; `openVaultFile` validates the decrypted payload's version (future versions rejected) and that `prefs`/`txNotes` are string maps. The UI wraps both in try/catch → friendly toast.

## Verification

`npm run types && npm run lint && npm test` (272 unit, incl. 8 vault) green; `NEXT_PUBLIC_USE_MOCK=false npm run build` clean; `e2e/vault-backup.spec.ts` round-trip (export → encrypted-file assertions → import success → wrong-password rejected) passes.
