# Second-Party Code Review: chore/audit-cleanup-batch-2

## Real issues to verify

### 1. `OnboardingGuard` safety-net removal (components/layout/guards.tsx:58-62)
The diff removes the `/terms` and `/privacy` branches from `allowedWhileOpen` and justifies it with a comment claiming the `(legal)` route group never mounts this guard. That's an **architectural invariant** that isn't enforced by code — it depends on layout composition staying the way it is. If a future change puts any legal page under a layout that wraps `OnboardingGuard`, an authenticated user hitting `/terms` gets bounced to `/wallet/account` — a silent regression with no test catching it. Either keep the defensive check (it's free), or add a routing test that asserts legal routes are never children of an `OnboardingGuard` layout.

### 2. `useWalletSynced` relocation (lib/hooks/use-new-messages-since-open.ts:5)
The local `useWalletSynced` and `useWalletInfo` are deleted and `useWalletSynced` is now imported from `@/lib/hooks/use-check-ins`. The diff doesn't show that module, so I can't confirm the imported hook has identical semantics (same `info.networkHeight <= 0` guard, same `>= networkHeight - 1` threshold). If the imported version differs by even one block, the "+N messages" badge firing point shifts. Worth eyeballing.

Also: the local `useWalletInfo` consumed `useWalletSession` and `services.wallet.getWalletInfo()`. The diff doesn't show those imports being removed from this file. If they're now unused, strict `noUnusedLocals`/eslint will fail the build — confirm they were actually scrubbed (lines outside the visible context).

### 3. Re-export tightening (lib/hooks/query-provider.tsx:12, lib/services/wallet.service.ts:3)
- `QueryClient` and `QueryClientProvider` are no longer re-exported through `query-provider`. The comment says tests import them directly from `@tanstack/react-query`, but **non-test code that imported them through this barrel will break**. A repo-wide grep is mandatory before merge.
- `export type { WalletSummary }` removed from `wallet.service.ts`. Anyone importing `WalletSummary` from there must move to `@/lib/types`. Same grep requirement.

### 4. Export-to-private conversions with no test deltas
A lot of public surface was silently narrowed without confirming nothing outside the diff references it:
- `inboundPaymentId`, `findContactForMessage`, `resolveConversationMatchFromMessage`, `filterConversationMessages` (lib/messages/conversations.ts)
- `findAddressBookContact`, `compareMessagesChronological` (lib/messages/thread-mappers.ts)
- `extractInputKeyImages`, `extractDepositInputs` (lib/services/real-sdk/scan.ts) — these in particular feel like they could be referenced by tests for the scanner.
- `walletKeysToUserKeys`, `freshRawWallet` (lib/services/real-sdk/wallet-build.ts)
- `MAX_POOL_SCAN` (lib/services/real-sdk/pool.ts) — magic number that tests sometimes reference.
- `MarketPriceSource` (lib/market/coingecko.ts)
- `QueuedBroadcastFailReason` (lib/types/index.ts:63) — still exposed as a property type on `QueuedTransaction`, but can no longer be named by callers. Realistic risk for any switch/case on `failReason`.
- `getWalletServices` made private in lib/services/index.ts — fine if the only consumers are co-located, but if anything in `app/` reaches in directly, breaks.

If the branch's CI is just `tsc + lint + test` and it's green, that proves internal usage is clean. **External consumers are not covered.** Confirm there are no published callers.

### 5. `WALLET_DONATION_ADDRESSES` deletion (lib/config/config.ts:56-60)
Three-address rotation list removed; only `WALLET_DONATION_ADDRESS` survives. Confirm no caller was randomizing across the array — that would silently collapse rotation to a single address. From the diff alone I can't prove the negative.

### 6. `downloadJsonFile` and `backupDownloadFilename` coupling (lib/ui/download-json-file.ts:16)
Behavior preserved, but note: the function still force-runs `backupDownloadFilename(filename)` internally, so a caller passing an already-sanitized path gets mangled. Pre-existing — not introduced here. Just noting that consolidating to `triggerBlobDownload` didn't fix the awkward signature.

## What's good

- `formatHashrate` extraction (lib/ui/format-hashrate.ts) is a clean dedupe — the two prior implementations were byte-identical.
- `triggerBlobDownload` (lib/ui/download-blob.ts) correctly preserves the `typeof window === "undefined"` throw and the deferred `revokeObjectURL` (1000ms). The WebKit/Safari timing comment is preserved.
- `sanitizePngLabel` extraction correctly preserves the trailing-dash trim after `slice(0, 16)`.
- `CCX_HUMAIN_DECIMAL_DISPLAY` → `CCX_PRECISION_DECIMAL_DISPLAY` is a pure rename — both equal `COIN_UNIT_PLACES`, so display behavior is unchanged.
- Test removal in `tests/donation-config.test.ts` matches the removed `getDonationMethodsDescription` export. No orphaned tests.

## Missing tests

- No test added for the new `triggerBlobDownload` shared helper. Given the original inline logic was untested in jsdom, this isn't a regression, but it's a missed opportunity to lock in the deferred-revoke contract.
- No test for `OnboardingGuard` behavior change in #1.
- No test for the `sanitizePngLabel` extraction — easy table-driven unit test would be cheap.

## Verdict

NEEDS WORK — the consolidations are sound, but the OnboardingGuard invariant change (#1), the unverified external-consumer grep for re-export removals (#3, #4), and the unverified `useWalletSynced` semantics (#2) need explicit sign-off before this lands.
