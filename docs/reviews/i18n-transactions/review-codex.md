Finding

- app/(wallet)/wallet/transactions/transactions-page-client.tsx:217: the disabled export tooltip still uses `walletCopy.exportCsvEmpty`, and line 220 still renders `walletCopy.exportCsvButton`; both values come from English-only constants in lib/ui/wallet-copy.ts:79-80, so non-English locales still show "Export CSV" / "No transactions to export." on the localized Transactions page. Fix: add dictionary keys for the export button label and empty tooltip, then render them with `t(...)` instead of `walletCopy`.

Checked clean

- components/wallet/transaction-display.tsx:33-95 keeps `transactionMeta` hook-free and stores only `labelKey`; label resolution happens inside render paths that call `useI18n()`.
- components/wallet/transaction-display.tsx:136-148 `StatusPill` calls `useI18n()` only as a React component. Its live callers are app/(wallet)/wallet/transactions/transactions-page-client.tsx:584 and :664, plus components/layout/rails/transactions-rail.tsx:104; app/layout.tsx:94 wraps app UI in `AppProviders`, and components/providers/app-providers.tsx:37-59 wraps children in `I18nProvider`.
- components/wallet/transaction-display.tsx:104-110 still returns canonical `"Confirmed"` / `"Pending"` tokens for logic; only display maps through `statusLabelKey(...)`.
- components/wallet/transaction-display.tsx:124-133 requires `t`; both call sites pass it at app/(wallet)/wallet/transactions/transactions-page-client.tsx:676-681 and components/layout/rails/transactions-rail.tsx:119-120.
- app/(wallet)/wallet/transactions/transactions-page-client.tsx:57-67 and :752-771 keep English tab IDs for filtering/e2e; components/wallet/common.tsx:206-219 makes `labels` optional and uses the localized label only for display at :235.
- lib/i18n/dictionaries.ts:155-208 plus the other locale `txn.*` blocks have matching key sets and placeholder sets for `{count}`, `{label}`, `{amount}`, `{time}`, `{received}`, `{sent}`, `{deposits}`, `{page}`, `{total}`, `{shown}`, `{total_count}`, and `{height}`.
- lib/i18n/dictionaries.ts:155, :169-174, and :192 preserve English display bytes for "Transaction History", All/Received/Sent/Deposits/Withdrawals/Messages, and `{label} transaction for {amount} from {time}`.
- Literal `t("...")` keys and `transactionMeta.labelKey` values used in the touched files all exist in the English dictionary.

Verification

- `npm run types`
- `npm test -- --run tests/i18n.test.ts tests/components.test.tsx`
