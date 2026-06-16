# Merged implementation spec — View-only mode

> Synthesis of four independent specs (Codex gpt-5.5, Gemini 3.1 Pro, GLM-5.2,
> Opus 4.8). This is the authoritative plan for implementation. Provenance for
> each decision is noted as _[who]_.

## Resolved design decisions (the forks)

1. **Field name: `viewOnly: boolean` on `WalletInfo`, required.** _[Opus/GLM
   naming; required-not-optional unanimous]_ Required so the type-checker forces
   every producer to set it — a missing flag is a compile error, not a silent
   `false` that lets a watch-only wallet "send". Matches the existing
   `ImportWalletInput.keys.viewOnly` naming (`lib/services/wallet.service.ts:29`).

2. **Derive once, at the mapping chokepoint.** _[Opus/Gemini]_ Add
   `viewOnly: w.isViewOnly()` to the object literal in `mapWalletToInfo`
   (`lib/wallet-core/mappers.ts:82`). This covers **all five** real-mode
   producers (`getWalletInfo`, `refreshWallet`, `finalizeCreateWallet`, import,
   open) in one edit. `mappers.ts` is project glue (kebab-case, imports
   `@/lib/types`), **not** a protected legacy class, so a one-line in-style
   addition is in-scope. We reject Codex/GLM's service-wrapper post-process
   (`withViewOnly` + dynamic `getRuntimeWallet()`): it adds a second source of
   truth and five wrap sites for no benefit now that the chokepoint is confirmed.

3. **Defence-in-depth guards live in the typed service layer, not the engine.**
   _[Codex/GLM]_ A shared `assertCanSpend`/`ViewOnlyWalletError` guards the four
   spend-key service methods in **both** real and mock, so a deep-link, stale
   cache, or non-UI caller fails with a friendly typed error instead of a cryptic
   `createTx` throw — and mock/real behave identically for e2e. We do **not** add
   guards inside `wallet-operations.ts` (keep that file untouched).

4. **Block at the control level, never the route.** _[unanimous]_ Read-only
   surfaces stay usable (address/QR, deposit list + maturity, message history +
   search). Only spend actions are neutralised. No redirects (also: static
   export has no server; a client redirect would flash the page).

---

## 1. Data model

`lib/types/index.ts:9` — add the required boolean (place it right after
`address`, keeping identity fields together):

```ts
export type WalletInfo = {
  address: string;
  /** True when the wallet has no private spend key (watch-only import).
   *  Send, Deposits create/withdraw, and Message send are unavailable. */
  viewOnly: boolean;
  balanceTotal: CcxAmount;
  // …rest unchanged
};
```

No other type changes. `ImportWalletInput.keys.viewOnly` already exists (input,
distinct from this derived runtime state). The `WalletService` interface needs
**no signature change** — every method returning `WalletInfo` now returns the
richer shape automatically.

## 2. Service layer

### 2.1 Shared guard helper — new `lib/services/view-only.ts`
_[Codex/GLM]_ Lives outside `lib/wallet-core`.

```ts
import type { WalletInfo } from "@/lib/types";
import { walletCopy } from "@/lib/ui/wallet-copy";

export class ViewOnlyWalletError extends Error {
  readonly code = "VIEW_ONLY_WALLET";
  constructor(message: string) {
    super(message);
    this.name = "ViewOnlyWalletError";
  }
}

export function assertCanSpend(viewOnly: boolean, message: string): void {
  if (viewOnly) throw new ViewOnlyWalletError(message);
}
```

### 2.2 Real mode — derive at the mapper (one line)
`lib/wallet-core/mappers.ts:82`, inside the existing `return { … }`:

```ts
return {
  address: w.getPublicAddress(),
  viewOnly: w.isViewOnly(),        // ← add (w is the resolved Wallet)
  balanceTotal: { atomic: gross + locked },
  // …unchanged
};
```

`Wallet.isViewOnly()` (`lib/wallet-core/Wallet.ts:298`) is already correct for
both the `keys` and `qr` view-only import paths (`wallet-operations.ts:146`,
`:210` set `priv.spend = ""`). The mapper already returns a fresh literal —
immutability holds. Reload-safe: a re-unlocked stored wallet re-derives the flag.

### 2.3 Real mode — guard the four spend ops
Add a runtime view-only read (reuse the engine) and call `assertCanSpend` at the
top of each, before delegating to `wallet-operations`:
- `lib/services/real/transaction.service.ts` → `sendTransaction` →
  `walletCopy.viewOnlySendDisabled`
- `lib/services/real/deposit.service.ts` → `createDeposit` & `withdrawDeposit` →
  `walletCopy.viewOnlyDepositDisabled`
- `lib/services/real/message.service.ts` → `sendMessage` →
  `walletCopy.viewOnlyMessageDisabled`

The read uses the already-initialised runtime wallet
(`getRuntimeWallet()?.isViewOnly() ?? false`) via a tiny real-only helper, so no
extra engine work. _[Codex/GLM]_

### 2.4 Mock mode — reachable view-only state + symmetric guards
`lib/services/mock/wallet.service.ts`: introduce module state (mock services are
singletons; reset between test files) so e2e can drive the app into view-only.
_[Codex/GLM/Gemini converge]_

```ts
let mockViewOnly = false;
function currentInfo(): WalletInfo {
  return { ...clone(mockWalletInfo), viewOnly: mockViewOnly };
}
export function _resetMockViewOnly() { mockViewOnly = false; } // test-only
```

- `getWalletInfo` / `refreshWallet` / `openWallet` → `currentInfo()`.
- `importWallet(input)` → set `mockViewOnly = input.method === "keys" &&
  input.viewOnly === true` (full imports/create reset to `false`), return
  `currentInfo()`.
- Add `viewOnly: false` to `mockWalletInfo` (`lib/mock-data/wallet.ts`) — the
  new required field forces it.
- Mirror `assertCanSpend(mockViewOnly, …)` in mock
  `transaction`/`deposit`/`message` services so both modes throw the same copy.

### 2.5 Onboarding already wires through
No change to `onboarding-actions.tsx`: it builds the `keys` input with `viewOnly`
and passes the returned `WalletInfo` into `openSession`, which seeds session +
React Query cache — so the flag is correct from first paint. _[Opus/Codex]_

## 3. UI / UX

### 3.1 Single source hook — `lib/hooks/index.ts`
_[GLM]_ `export function useWalletViewOnly(): boolean { return useWalletInfo().data?.viewOnly ?? false; }`

### 3.2 Banner — new `components/wallet/view-only-banner.tsx`
_[GLM/Opus]_ Mirror `components/wallet/syncing-banner.tsx` shape; `role="status"`,
`data-testid="view-only-banner"` (robust e2e assertion), amber/eye treatment.
Returns `null` unless view-only. Rendered next to the existing
`<WalletSyncingBanner />` on Account, Send, Deposits, Messages, and Receive
(Receive is useful context: "you can receive but not send").

### 3.3 Badge
_[Codex/GLM]_ Persistent chrome, not per-page. Extend `PageHeader`
(`components/wallet/common.tsx`) with an optional `badges?: ReactNode` slot, then
pass `<Badge variant="secondary">{walletCopy.viewOnlyBadge}</Badge>` when
view-only. (`Badge` from `components/ui/badge.tsx`, already used in the codebase.)

### 3.4 Disable the three action surfaces + short-circuit handlers
For each, OR `viewOnly` into the **existing** `disabled` expression, add a `title`
tooltip, and render `<ViewOnlyBanner />`. **Also guard the submit/confirm
handlers** so a payment deep-link / Enter-submit can't slip a tx through. _[Opus/Codex]_

| Page | File | Controls | Handler short-circuit |
|---|---|---|---|
| Send | `app/(wallet)/wallet/send/page.tsx` | "Review Send" (`:286/289`) + confirm | `confirmSend` early-return + toast; gate the payment-link `setReview` effect (`:110-136`) and form `onSubmit` (`:180`). Keep Address/QR card live. |
| Deposits | `deposits-page-client.tsx` | "Create New Deposit" (header `:130` + empty-state `:1202`), Review-Deposit button, `DepositWithdrawButton` (`:1087`) | short-circuit `confirmCreate`/`confirmWithdraw`. Add `useWalletInfo()` (one line). List/charts/calculator stay live. |
| Messages | `app/(wallet)/wallet/messages/page.tsx` | "New Message" (`:254`), reply textarea+send (`:323/336`), compose send (`:463`) | short-circuit compose/reply send. **Reading + mark-read stay enabled** (view-key ops). |

### 3.5 Copy — `lib/ui/wallet-copy.ts`
```ts
viewOnlyBadge: "View-only",
viewOnlyBanner: "This is a view-only wallet — it can watch balances and receive, but cannot send, deposit, or message. Import the full wallet (with its spend key) to unlock these actions.",
viewOnlySendDisabled: "This is a view-only wallet. Import the spend key to send CCX.",
viewOnlyDepositDisabled: "This is a view-only wallet. Creating or withdrawing deposits requires the spend key.",
viewOnlyMessageDisabled: "This is a view-only wallet. Import the spend key to send messages.",
```
Same strings used in UI copy **and** service guard errors so unit/e2e can assert stable text. _[Codex]_

## 4. Edge cases _[merged from all four]_
1. **Reload, real mode** — keys not persisted; on re-unlock `mapWalletToInfo`
   re-derives `viewOnly`. ✅
2. **Reload, mock mode** — session persists `viewOnly`; first refetch returns
   current `mockViewOnly`. e2e never reloads mid-test. ✅
3. **Switching wallets** — `closeSession` clears info; each `openSession`
   overwrites the cache; full wallet after view-only flips to `false`. ✅
4. **Deposits**: view/maturity/calculator read-only-enabled; create + withdraw
   disabled (both build txs). **Messages**: read/search/mark-read enabled; send +
   reply disabled.
5. **Payment deep-link to Send** — form fills, banner explains, submit disabled,
   `confirmSend` guarded. No silent bounce.
6. **Export shows empty spend key** — add a copy-only note in the export dialog
   when view-only ("Spend key is blank — view-only wallet"). _[GLM/Codex]_
7. **Optimize / fusion** — a real `createTx` path the brief didn't list; all four
   specs flagged it. Guard its trigger on `viewOnly` too (and `assertCanSpend` if
   a real fusion op exists). Also suppress any "optimize your dust" prompt for
   view-only wallets _[Gemini]_.
8. **Loading** — `viewOnly` defaults `false` while `wallet.data` is `undefined`;
   no spurious banner flash.

## 5. Test plan
**Unit (vitest, `tests/`):**
- Extend `tests/mock-services.test.ts`: `importWallet({keys, viewOnly:true})` →
  `getWalletInfo().viewOnly === true`; mnemonic / `viewOnly:false` → `false`;
  full import after view-only resets to `false`; immutability (returned ref ≠
  `mockWalletInfo`, fixture unchanged).
- New `tests/view-only-guard.test.ts`: with mock view-only on, the four spend
  methods reject with their `walletCopy.*` text; reads (`listTransactions`,
  `listDeposits`, `listMessages`, `markRead`) still resolve.
- New `tests/view-only-banner.test.tsx`: banner renders only when view-only
  (RTL; remember manual cleanup per project memory).
- Type-level: required field makes `npm run types` fail if any `WalletInfo`
  literal omits `viewOnly` — cheapest strongest guard.

**E2E (Playwright, `e2e/view-only-mode.spec.ts`, mock, port 3100):** import via
Keys with View-only toggled → assert badge visible; Send → banner +
`[data-testid="view-only-banner"]`, "Review Send" disabled, Address/QR still
present; Deposits → create disabled, list visible; Messages → "New Message"
disabled, list visible; Receive → QR/address usable. Negative: a normal mock open
shows no banner and Send enabled. Do not reload mid-test.

## 6. Implementation order
1. `lib/types/index.ts` — add `viewOnly`.
2. `lib/services/view-only.ts` — guard helper + error.
3. `lib/wallet-core/mappers.ts` — one-line derive.
4. `lib/services/real/{transaction,deposit,message}.service.ts` — guards.
5. `lib/mock-data/wallet.ts` + `lib/services/mock/wallet.service.ts` — state +
   `_resetMockViewOnly`; mirror guards in mock transaction/deposit/message.
6. `lib/ui/wallet-copy.ts` — copy.
7. `lib/hooks/index.ts` — `useWalletViewOnly`.
8. `components/wallet/view-only-banner.tsx`; `components/wallet/common.tsx`
   `badges?` slot.
9. Pages: account, send, deposits, messages, receive — banner + disabled +
   handler short-circuits.
10. Tests (unit + guard + banner + e2e).
11. `npm run lint && npm run types && npm test && npm run test:e2e`.

## 7. Out of scope / follow-ups
View-only-specific export UX beyond the note; consolidating the two stacked
banners into `<WalletStatusBanners>`; wiring real fusion/optimize (guard it when
built).
