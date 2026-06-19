# #84 i18n — Settings page (conservative) — review response

Localizes the SAFE labels on the Settings page — the LAST page of the #84 effort — into all
10 locales, while leaving destructive/security copy (delete-wallet, panic-wipe) in English.
Reviewers: Codex, CodeRabbit. GLM unavailable (opencode hang).

## Safety split

- **Localized (53 `settings.*` keys):** section headings (General, Node, Wallet, Security),
  control labels + neutral descriptions (Theme, Passkey unlock, Notifications, Ticker,
  Optimization, custom node, Sync speed, block heights, Auto-lock, Password change), the
  device-data vault-backup description. Reuses `nav.settings`/`theme.label`/`settings.language*`/
  `wallets.*`.
- **Left ENGLISH + flagged (destructive/security):** the delete-wallet block (title
  "Delete wallet?", "This permanently deletes the encrypted wallet…"), the "Panic wipe" label +
  "Erases everything local…" description, and `components/wallet/panic-wipe-dialog.tsx`
  (untouched). Also left: `toast.*` runtime messages + cross-module label maps (out of scope).

## Independent verification (orchestrator)

- grep of all `settings.*` keys for panic/wipe/erase/permanently-delete/delete-wallet → **none**.
- Subcomponent `useI18n()` calls are at component scope (SyncSpeedSelector, NotificationsSetting,
  the page) — no module-scope hooks; module-scope label arrays resolved via `t()` at render.
- The pre-existing `wallets.deleteTitle`="Delete wallet?" is the separate #95 multi-wallet flow
  (already localized); the settings-page inline delete title stays hardcoded English.
- 56 `settings.*` keys exist; parity passes; placeholders ({count},{minutes}) intact ×10;
  en byte-identical → theme/i18n/multi-wallet/vault-backup/biometric e2e 9/9.

## Codex (gpt-5.5)

**No findings.** Confirmed destructive copy stays English (delete-wallet + panic-wipe lines + panic-wipe-dialog untouched; no destructive settings.* key), hook safety (3 component-scope useI18n), en-identity, key/placeholder parity, reused-key correctness.

## CodeRabbit

`coderabbit review --plain -t all --base main` -> **No findings.**

## Notes

This completes the SAFE-label pass across every wallet page (#84). The remaining English
strings are exactly the security/destructive copy — send confirmation, recipient-correctness
warnings, delete-wallet / panic-wipe, key export — concentrated in a handful of components
(`panic-wipe-dialog`, `send-review-warnings`, `walletCopy`, the export page) and the `toast.*`
runtime feedback, all awaiting a translator-in-the-loop pass.
