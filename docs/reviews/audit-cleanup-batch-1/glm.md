# Second Opinion — chore/audit-cleanup-batch-1

## 🔴 Likely blockers / regressions

### 1. `DEPOSIT_DURATION_OPTIONS` is a hidden contract change (two files)
`app/(wallet)/wallet/deposits/interest-calculator-dialog.tsx:156` and `components/layout/rails/deposits-rail.tsx:131` swap `Array.from({ length: DEPOSIT_MAX_TERM_MONTH }, (_, i) => i + 1)` (i.e. `[1..N]`) for `DEPOSIT_DURATION_OPTIONS`. The value of that constant is **not shown anywhere in the diff**. If it isn't exactly the contiguous `1..DEPOSIT_MAX_TERM_MONTH` range (e.g. if it's `[1, 3, 6, 12]` or skips a value), this silently changes which deposit durations are selectable — which in turn changes which tiers `getDepositTierIndex` will resolve to and what interest the calculator reports. Either paste the definition of `DEPOSIT_DURATION_OPTIONS` for review, or restore the `Array.from(...)` form. This is exactly the kind of refactor that hides a behavior change behind a rename.

### 2. Mock `markRead` now throws — UI error path not shown
`lib/services/mock/message.service.ts:36-40` now throws `Message not found.` to mirror the real SDK. That's correct in principle, but the diff doesn't include any UI mutation-fn `onError` or query-invalidate guard. React Query will surface this as an unhandled rejection in the message-list UX; previously it silently no-op'd. Flag any caller (likely in `lib/hooks/messages*` or a messages page) and confirm it has an `onError` / toast. Without that, this is a regression in dev/QA behaviour.

### 3. `WalletSwitcher` API change — verify no other callers
`components/layout/wallet-switcher.tsx` drops the `variant` and `collapsed` props entirely. The diff only shows `global-header.tsx:497` updating its call site. The previous docstring explicitly described a `sidebar` variant used under the brand when the rail is expanded. **If a sidebar layout file still renders `<WalletSwitcher variant="sidebar" collapsed={…} />` it will now TS-error at build time** (extra props) — but only if `strict`/`noUnusedParameters` etc. catch it; otherwise the props are silently dropped and the sidebar entry just disappears. Search the tree for any other `<WalletSwitcher` usage; the diff doesn't demonstrate that was done.

### 4. Deleted UI primitives — confirm zero remaining importers
`components/ui/info-pill-button.tsx`, `components/ui/separator.tsx`, `components/ui/tabs.tsx` are deleted, and `package.json` drops `@radix-ui/react-separator` and `@radix-ui/react-tabs`. The diff includes **no grep evidence** that nothing else imports `Separator`, `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, or `InfoPillButton`. Any surviving import → build break (component file gone) or runtime `ModuleNotFound`. Given these are generic-sounding primitives, this is the single most likely thing to break the build. The reviewer should run `rg "from \"@/components/ui/(separator|tabs|info-pill-button)\""` and paste the (hopefully empty) output before ship.

## 🟡 Worth fixing before merge

### 5. Removed i18n keys without proof of zero references
`lib/i18n/dictionaries.ts` strips keys across **all 9 locales**: `qr.codeAria`, `action.confirm`, `action.copied`, `action.close`, `settings.general`, `wallets.addWallet`, `wallets.title`, `wallets.switched`, `wallets.empty`, `rail.noTransactionSelected`, `rail.noTransactionSelectedHint`, `send.openReceive`, `send.recentlySentDesc`, `receive.last5Incoming`, `receive.last5Deposits`. If any component still calls `t("wallets.switched")` (toast on wallet switch) or `t("qr.codeAria")` (QR img alt), the user will see the raw key string in production. Same demand as #4: grep the codebase and include the empty result in the PR description. Especially suspicious: `wallets.switched` looks like a toast string that probably is still triggered somewhere by `useSwitchWalletFlow`.

### 6. `decodeFeeRecipient` return type widened
In `lib/services/real-sdk/transaction.service.ts` the old local `decodeFeeRecipient` was typed to return `{ spendPublicKey: string; viewPublicKey: string }`. The new shared one in `spend.ts:73` returns `DecodedRecipient` (whatever extra fields that has). Consumers spread it into `destinations` — should be safe — but if `DecodedRecipient` is `readonly` in some fields or carries non-enumerable props, the destination object shape could change. Low risk, but worth a glance at the `DecodedRecipient` definition.

### 7. No tests for the contract changes
- `message.service.ts` mock: should have a unit test asserting `markRead("unknown")` rejects. The previous behavior was a bug (silent wrong-row patch); the fix deserves a regression test.
- `decodeFeeRecipient`/`safeNodeFeeAddress` move: at minimum a test that `decodeFeeRecipient("garbage")` returns the donation address's keys, not throws. The whole point of that fallback is security (don't let a malicious node crash the send path); a test guards against future "refactors" that turn it back into a throw.

### 8. `safeNodeFeeAddress` is now exported but unchanged
`lib/services/real-sdk/spend.ts:60-68` exports the same implementation that used to live privately in two service files. Fine — but the comment "fall back to the donation address when the (untrusted) node returns an undecodable string" in `decodeFeeRecipient` is doing real security work. Make sure the fallback address (`WALLET_DONATION_ADDRESS`) is a constant, not something node-influenceable. It's imported from `config.ts`, so that looks OK.

## ⚪ Minor / observations

- `app/(wallet)/wallet/send/page.tsx:32-36` and `components/layout/rails/send-rail.tsx:9` both alias `SEND_FEE_CCX as SEND_FEE`. The local aliasing is a smell — just rename the call sites to use `SEND_FEE_CCX`. Not worth blocking.
- `WalletSwitcher` cleanup removes the `ChevronDown` icon import but keeps `Check`, `ChevronsUpDown`, `Download`, `Plus`. Looks correct.
- The mock change in #2 is technically a **public API contract change** for any consumer relying on the old lenient behaviour. The PR title "audit-cleanup-batch-1" undersells it.

## Verdict

**NEEDS WORK** — refuse to merge until (a) `DEPOSIT_DURATION_OPTIONS`'s definition is shown and confirmed identical to the previous range, (b) build passes with the deleted UI primitives (grep evidence required), and (c) the removed i18n keys are confirmed unreferenced — especially `wallets.switched`. The mock `markRead` throw also needs an UI-error-handling check and a regression test.
