## Findings

1. `app/(wallet)/wallet/deposits/deposits-page-client.tsx:372` + `lib/i18n/dictionaries.ts:522` - `Next Unlock` now always uses `deposits.daysValue` (`"{count} days"`), so a deposit unlocking in 1 day renders as `1 days` and the same singular/plural loss is copied into every locale. Fix: split this key into one/other variants (or reuse `deposits.daysLabelOne/Other`) and select by `Math.round(value) === 1`.

2. `app/(wallet)/wallet/deposits/deposits-page-client.tsx:924`, `app/(wallet)/wallet/deposits/deposits-page-client.tsx:1472`, `app/(wallet)/wallet/deposits/deposits-page-client.tsx:1532` + `lib/i18n/dictionaries.ts:551` - `monthsValue` replaced the old singular branch and always renders `"{count} months"` in English. Since `DEPOSIT_DURATION_OPTIONS` starts at `DEPOSIT_MIN_TERM_MONTH` and includes the minimum month value, a 1-month term displays `1 months` in the card, duration select, and confirm dialog. Fix: add `monthsValueOne/Other` and select on `count === 1`, or keep the existing branch and localize both forms.

## Clean Checks

- Warning/consequence copy: no localized losing/forfeiting/early-withdrawal warning found in the page; deposit and withdraw confirmation descriptions still come from `walletCopy.depositCreateConfirm` / `walletCopy.depositWithdrawConfirm` at `app/(wallet)/wallet/deposits/deposits-page-client.tsx:1204` and `app/(wallet)/wallet/deposits/deposits-page-client.tsx:1526`.
- Hook safety: no `useI18n()` at module scope; `DEPOSIT_STATUS_LABEL_KEYS` is a module-scope key map only, and `DepositStatusPill` resolves it through `t()` inside the component at `app/(wallet)/wallet/deposits/deposits-page-client.tsx:1275` and `app/(wallet)/wallet/deposits/deposits-page-client.tsx:1284`.
- Math/interpolation: APR, principal, interest, fees, maturity values, and dates still use the same computed values; surrounding labels changed only.
- Dictionary integrity: 102 `deposits.*` keys in each of the 10 locales (en, es, fr, de, it, pt, ru, zh, ja, ko); placeholder sets match English for all deposit keys; all literal page `t()` keys exist in English fallback.
- Static checks: `npm run types` and `npm run lint` pass.
