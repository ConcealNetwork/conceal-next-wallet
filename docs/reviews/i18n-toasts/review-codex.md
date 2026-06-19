# Critical i18n Toast Review

## Findings

- [High] lib/i18n/dictionaries.ts:321 + components/wallet/storage-warning-banner.tsx:79 - `toast.storageKept` localizes "This browser will now keep your wallet - it won't auto-clear it."; this is a storage/data-loss consequence toast, and "auto-clear" is the same erase/clear class the slice is supposed to exclude. Fix: keep this toast hardcoded English or move it to `walletCopy`, and remove `toast.storageKept` from all locale dictionaries.

## Checked Clean

- app/(wallet)/wallet/settings/page.tsx:309-332 + lib/services/real-sdk/settings.service.ts:189-205 + lib/wallet-core/settings-operations.ts:182-196 - `Creation height updated - rescanning...` and `Wallet reset - rescanning...` reset scanned history/scan height and resync from `creationHeight`; they do not delete keys, seed/recovery material, or spend funds. No exclude-required destructive wallet deletion found there.
- components/wallet/transaction-note.tsx:18-36 and components/wallet/storage-warning-banner.tsx:49-99 - new `useI18n()` calls are at component scope; toast handlers close over `t` normally.
- tests/storage-warning-banner.test.tsx:27-29 - mocking `useI18n` as `(key) => key` does not weaken the existing behavior assertions because the test only asserted button presence, persistence request/invalidation, and toast firing, not exact message text.
- app/(wallet)/wallet/send/page.tsx:210, app/(wallet)/wallet/deposits/deposits-page-client.tsx:223/1166, app/(wallet)/wallet/messages/page.tsx:217/263, app/(wallet)/wallet/export/page.tsx:54/68, app/(wallet)/wallet/change-password/page.tsx:48 - send/deposit/message broadcast, export, and change-password success toasts remain English via `walletCopy` or hardcoded fallback strings.
- lib/i18n/dictionaries.ts - mechanical check found 28 new `settings.toast*` keys plus 5 new global `toast.*` keys in the live staged diff, not 34 total; no locale parity failures, no `{blocks}` placeholder mismatches, and no missing `t()` keys in the touched components.

## Verification

- `npm test -- tests/storage-warning-banner.test.tsx` passed: 4 tests.
