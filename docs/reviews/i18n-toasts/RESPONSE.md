# #84 i18n — neutral toasts — review response

Localizes ONLY the NEUTRAL `toast.*` runtime messages into all 10 locales (34 new keys:
`settings.toast*` 28, `toast.*` 6), deliberately leaving every consequence/security toast
in English. Reviewers: Codex, CodeRabbit. GLM unavailable (opencode hang).

## Classification (the safety core)

The subagent classified every in-scope toast. Most page toasts were already localized in the
earlier per-page slices; the remaining hardcoded/`walletCopy` toasts were classified:

- **NEUTRAL → localized:** notifications enabled/disabled/blocked, settings/ticker/node
  updated, custom/public node connected, node-lag heads-up (`{blocks}`), creation-height
  validation, rescan started, optimization complete/none/failed, note saved/removed, storage
  kept/installed.
- **EXCLUDE → left English / `walletCopy`:** every send/deposit/message **broadcast** toast,
  `viewOnly*` (spend-key) toasts, the **recovery-phrase** storage toast, ALL export-page and
  change-password-page toasts, and the send "confirm to send" toast (unsure → excluded).

## Independent verification (orchestrator)

- grep of all NEW toast keys for consequence phrasing (sent, broadcast, withdraw, wiped,
  erased, deleted, panic, recovery-phrase, seed, spend-key, permanently) → **none localized**.
- The one destructive-sounding NEUTRAL — "Wallet reset — rescanning…" — fires from
  `handleResetAndRescan` (`useResetAndRescan`, re-reads the chain), NOT the wipe
  (`PanicWipeDialog`) or delete (`useWalletDelete`), which are separate + excluded. Confirmed
  non-destructive → NEUTRAL correct.
- `transaction-note` + `storage-warning-banner` gained component-scope `useI18n()`; toasts fire
  in handlers where `t` is in scope. No `package-lock.json` leaked (the agent's `npm install`
  did not change the committed diff).
- Parity passes; placeholder `{blocks}` intact ×10; en byte-identical → tx-notes + storage-
  watchdog + payment-reminders e2e green.
- `tests/storage-warning-banner.test.tsx` mocks the new `useI18n` dependency (`t: key => key`);
  the test asserts the toast FIRED (via the sonner mock) + finds buttons by their still-English
  labels — assertions not weakened.

## Codex (gpt-5.5)

| # | Finding | Verdict |
|---|---------|---------|
| 1 (high) | `toast.storageKept` ("…it won't auto-clear it.") is data-loss-class storage messaging — the "auto-clear" wording is the erase class this slice excludes | **Accepted.** Reverted the WHOLE storage-warning-banner to English (it's wallet-data-safety UI; its main warning was already English) and removed `toast.storageKept` + `toast.storageInstalled`. |

Codex confirmed clean: the rescan toasts ("Wallet reset / Creation height updated — rescanning…") reset scan height + resync, do NOT delete keys/seed or spend funds (non-destructive); hook safety; the test mock doesn't weaken assertions; all send/deposit/message-broadcast + export + change-password toasts stay English.

## CodeRabbit

| # | Finding | Verdict |
|---|---------|---------|
| 1 (minor) | `storage-warning-banner.test.tsx:29` — duplicate `vi.mock("@/lib/i18n/i18n-provider")` line | **Resolved** by the banner+test revert above (the mock is gone entirely). |

## Notes

This is the last clearly-safe #84 slice. What remains is exactly the security/consequence copy
(send/deposit/message broadcast confirmations, recovery-phrase, key export, change-password,
panic-wipe/delete) + the onboarding (seed) flow — all awaiting a translator-in-the-loop pass.
