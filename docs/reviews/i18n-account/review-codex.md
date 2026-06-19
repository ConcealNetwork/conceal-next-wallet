# i18n Account Review - Codex

Verdict: no mechanical correctness findings in the requested scope.

Checked:
- Placeholder integrity: PASS. All locale values preserve the same placeholder token sets as English, including `{message}`, `{pct}`, `{days}`, `{total}`, `{usd}`, `{count}`, `{change}`, `{received}`, `{sent}`, `{deposits}`, `{label}`, `{value}`, `{items}`, and `{lastActivity}`.
- Key parity: PASS. All 10 locale dictionaries have identical key sets.
- English behavior: PASS. `lib/i18n/dictionaries.ts:120`, `lib/i18n/dictionaries.ts:78`, `lib/i18n/dictionaries.ts:80`, `lib/i18n/dictionaries.ts:79`, `lib/i18n/dictionaries.ts:81`, and `lib/i18n/dictionaries.ts:143` keep `Account Overview`, `Available`, `Pending`, `Locked`, `Withdrawable`, and `Dust`.
- Reused rail keys: PASS. `lib/i18n/dictionaries.ts:78`, `lib/i18n/dictionaries.ts:80`, `lib/i18n/dictionaries.ts:79`, `lib/i18n/dictionaries.ts:81`, `lib/i18n/dictionaries.ts:84`, and `lib/i18n/dictionaries.ts:85` match the old Account page labels/notes used at `components/wallet/balance-hero.tsx:67`, `components/wallet/balance-hero.tsx:75`, `components/wallet/balance-hero.tsx:83`, `components/wallet/balance-hero.tsx:94`, `components/wallet/balance-hero.tsx:80`, and `components/wallet/balance-hero.tsx:99`.
- `of {total} total · {usd} USD`: PASS. `components/wallet/balance-hero.tsx:129` moves `font-semibold` to the whole `<p>`; `components/wallet/balance-hero.tsx:130` still passes `total: totalLabel` and `usd: formatUsd(totalUsd)`, preserving the previous values from the old implementation.
- Missing translation keys: PASS. All literal `t()` keys and `TX_META.labelKey` values in the touched TSX files resolve in `lib/i18n/dictionaries.ts`.

Verification:
- Ran a TypeScript AST check for locale key parity, placeholder parity, selected English exact values, and touched-file translation references.
- Ran `npm run types` successfully.
