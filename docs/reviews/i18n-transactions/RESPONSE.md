# #84 i18n — Transactions page — review response

Localizes the Transactions page + the shared `transaction-display` module into all 10
locales (55 new `txn.*` keys; reuses `account.tx*`/`rail.*`/`action.*`/`nav.*`), with a
hook-safe refactor of the shared label/status helpers. Reviewers: CodeRabbit, Codex.
GLM omitted (opencode review-size hang).

## Independent verification (orchestrator)

- Shared `StatusPill` (now uses `useI18n`) is only rendered in the transactions page +
  rail — all client UI under `I18nProvider` (`DepositStatusPill`/`SyncStatusPill` are
  separate components). No non-provider usage.
- `FilterTabs` filters by the ENGLISH tab id (`transactionMatchesTab(transaction, active)`);
  only the display label is localized. Filtering + e2e unaffected.
- All `t()` keys exist in the dictionary; parity test passes; placeholders preserved across
  all 10 locales; en byte-identical for selector-critical strings → 11/11 e2e
  (shell-redesign + tx-notes + export-csv).

## Codex (gpt-5.5)

| # | Finding | Verdict |
|---|---------|---------|
| 1 | The Export-CSV button label + disabled tooltip render English-only `walletCopy` constants → stay English in all locales | **Fixed.** Added `txn.exportButton` / `txn.exportEmpty` to all 10 locales and render them via `t()` at the call site (the constants are used nowhere else). en kept identical ("Export CSV"). |

Codex confirmed clean: hook-safe `transactionMeta` (labelKey, no module-scope hook),
`StatusPill` provider scope, `getTransactionStatus` still returns canonical tokens (logic
unchanged), `formatHeightWithConfirmations`'s new `t` param passed at both call sites,
`FilterTabs` id/label separation, placeholder + key parity, en byte-identity.

## CodeRabbit

`coderabbit review --plain -t all --base main` → **No findings.**

## Notes

No seed/recovery/send/export-key security copy on these files — none touched. Machine
translations carry the usual native-review caveat (idiomatic crypto-wallet terms).
