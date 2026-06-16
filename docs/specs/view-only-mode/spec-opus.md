# Implementation spec — View-only mode (spec-opus)

> Author: Opus 4.8. Grounded in the real files cited inline. Competing draft;
> opinionated by design.

## 0. Core design decision (read this first)

`WalletInfo` is the single object that already flows everywhere:
`importWallet`/`getWalletInfo`/`refreshWallet`/`openWallet` all return it,
`openSession(walletInfo, …)` seeds it into both
`WalletSessionProvider` state and the React Query `queryKeys.wallet` cache
(`lib/session/wallet-session.tsx:71-86`), and **every page reads it through the
same hook** — `useWalletInfo()` → `wallet.data` (`lib/hooks/index.ts:28-36`).
Send (`app/(wallet)/wallet/send/page.tsx:75`), Deposits
(via `deposits-page-client.tsx`), and Messages
(`app/(wallet)/wallet/messages/page.tsx:64`) already call `useWalletInfo()`.

**Therefore: put one boolean `viewOnly` on `WalletInfo`. No new service method,
no new hook, no new context, no route guard.** It propagates to every consumer
for free, survives the persisted-session round-trip, and stays in the typed
service layer (the architectural spine). This is the smallest correct change
and the one with the fewest places to forget.

I explicitly **reject** these alternatives:
- A standalone `services.wallet.isViewOnly()` method → adds a second async
  source of truth that can disagree with `wallet.data`, and forces a new hook.
- A route-level guard / redirect → the brief wants a *friendly disabled state
  with explanation*, not a 404 or bounce; users must still reach Send to read
  their address + QR (already rendered at send/page.tsx:300-317).

---

## 1. Data model

### 1.1 `WalletInfo` (`lib/types/index.ts:9`)

Add one required boolean. Make it required (not optional) so every producer is
forced by the type-checker to set it — a missing flag must be a compile error,
not a silent `undefined` that defaults a watch-only wallet into "can send".

```ts
export type WalletInfo = {
  address: string;
  /** True when the wallet holds no private spend key (watch-only). Send,
   *  Deposits create/withdraw and Message send are unavailable. */
  viewOnly: boolean;
  balanceTotal: CcxAmount;
  // …rest unchanged
};
```

Placing it second (right after `address`) keeps the "identity" fields together
and makes the required-field churn obvious in review.

### 1.2 No other type changes

`ImportWalletInput.keys.viewOnly` already exists
(`lib/services/wallet.service.ts:29`) — that is *input*, separate from the
*derived runtime state* we are adding. The `WalletService` interface
(`wallet.service.ts:68-85`) needs **no signature change**: every method that
returns `WalletInfo` now returns the richer shape automatically.

---

## 2. Service layer

### 2.1 Real mode — derive at the single mapping chokepoint

Every real-mode `WalletInfo` is produced by exactly one function:
`mapWalletToInfo(wallet, networkHeight)` in `lib/wallet-core/mappers.ts:72-94`.
It is called from all five entry points in `wallet-operations.ts` (lines 68,
114, 189, 226, 249), which back `getWalletInfo`, `refreshWallet`,
`finalizeCreateWallet`, the `file` import, and the general import/open path.

**Change: add one line to `mapWalletToInfo`'s returned object.**

```ts
// lib/wallet-core/mappers.ts — inside the existing `return { … }` at line 82
return {
  address: w.getPublicAddress(),
  viewOnly: w.isViewOnly(),   // ← add this; w is the resolved Wallet
  balanceTotal: { atomic: gross + locked },
  // …unchanged
};
```

`Wallet.isViewOnly()` (`lib/wallet-core/Wallet.ts:298`) returns
`this.keys.priv.spend === ""`. The `keys` import path sets `priv.spend = ""`
for view-only (`wallet-operations.ts:146`) and the `qr` view-only path does the
same (`wallet-operations.ts:210`), so `isViewOnly()` is already correct for
every way a watch-only wallet can enter the runtime. `resolveWalletForMapping`
(used at mappers.ts:73) returns a `Wallet`, which exposes `isViewOnly` — no new
wallet-core code, satisfying "do not modernize legacy `wallet-core`".

> **Why the mapper, not the service wrapper?** `lib/services/real/wallet.service.ts`
> just forwards to `wallet-operations`; it never builds the `WalletInfo`. Doing
> it in the mapper covers *all* producers in one edit and guarantees `refresh`,
> `open`, `create`, and every `import` method agree. (Created wallets are
> never view-only, so they correctly get `false`.)

`mapWalletToInfo` already returns a fresh object literal — immutability holds.

### 2.2 Mock mode — must be able to *reach* view-only state

Mock mode is the default and the only mode e2e runs in (golden-path runs
forced-mock). Two edits:

**(a) Default mock fixture is a full wallet** — add `viewOnly: false` to
`mockWalletInfo` in `lib/mock-data/wallet.ts` (the object ending at
`networkHeight` — currently lacks the field; the new required type forces it).

**(b) Honour `importWallet({method:"keys", viewOnly:true})`** so a test can
drive the app into view-only state. Today
`mockWalletService.importWallet` ignores its input and returns
`clone(mockWalletInfo)` (`lib/services/mock/wallet.service.ts:39-44`). Replace
with an immutable override:

```ts
// lib/services/mock/wallet.service.ts
async importWallet(input) {
  await mockDelay();
  const viewOnly = input.method === "keys" && input.viewOnly === true;
  return { ...clone(mockWalletInfo), viewOnly };
},
```

`getWalletInfo` / `refreshWallet` / `openWallet` in mock mode still return
`clone(mockWalletInfo)` (i.e. `viewOnly:false`). That is acceptable: the
view-only state is carried into the session by `openSession(wallet, …)` at
import time (`onboarding-actions.tsx:405-406`), which seeds the query cache, and
the e2e flow never reloads (see §4.1 for the reload caveat and §5.2 for the
test). If we want mock view-only to *survive a refetch*, see Risk R3.

> Spread-over-clone keeps immutability and avoids mutating the shared
> `mockWalletInfo` singleton (`clone` already deep-copies; the spread layers the
> override without touching the source).

### 2.3 Onboarding already wires it through

No change needed in `onboarding-actions.tsx`: it builds the `keys` input with
`viewOnly` (lines 396-404), calls `services.wallet.importWallet(input)`, and
passes the returned `WalletInfo` straight into `openSession`
(`onboarding-actions.tsx:405-406`). With §2.1/§2.2 the returned object now
carries `viewOnly`, so the session + query cache are correct from first paint.

---

## 3. UI / UX

Two-part treatment, mirroring the **existing** `WalletSyncingBanner` pattern
(`components/wallet/syncing-banner.tsx`) which already gates these same three
pages with `disabled={isSyncing}`. We layer view-only on top using the identical
mechanism, so the visual language and disable logic are consistent.

### 3.1 A reusable disabled flag + banner

**Disable at the *control* level, not the route level.** Read-only pages must
remain viewable (address/QR on Send, deposit list on Deposits, message history
on Messages). We only neutralise the *actions that need a spend key*.

Add a tiny derived helper next to the sync helpers
(`lib/ui/wallet-sync.ts`, beside `isWalletSyncing` at line 9):

```ts
export function isViewOnly(info: WalletInfo | undefined): boolean {
  return info?.viewOnly === true;
}
```

Add a new component `components/wallet/view-only-banner.tsx` that copies the
`WalletSyncingBanner` shape but uses the amber warning tone already in the
codebase (`text-wallet-amber`, used at messages/page.tsx for the self-send
note) and `role="status"`:

```tsx
"use client";
import { useWalletInfo } from "@/lib/hooks";
import { walletCopy } from "@/lib/ui/wallet-copy";

export function ViewOnlyBanner() {
  const { data } = useWalletInfo();
  if (!data?.viewOnly) return null;
  return (
    <div
      className="mb-4 rounded-xl border border-wallet-amber/30 bg-wallet-amber/10 px-4 py-3 text-sm text-foreground"
      role="status"
      data-testid="view-only-banner"
    >
      {walletCopy.viewOnlyBanner}
    </div>
  );
}
```

A `data-testid` is added deliberately so the e2e assertion is robust to copy
changes (§5.2).

### 3.2 A small badge on the account/balance hero

Surface the *persistent* state (the banner lives only on action pages). Add a
`Badge` (`components/ui/badge.tsx`, `variant="secondary"`, already used in
`components/wallet/common.tsx:279`) reading "View-only" next to the address in
the balance hero (`components/wallet/balance-hero.tsx`). The hero receives
`wallet` already (it reads `wallet.lockedDeposits` at line 46), so gate on
`wallet.viewOnly`. Use the `secondary` variant (muted) so it informs without
alarming — the wallet works fine for watching.

### 3.3 Disable the three action surfaces

For each, OR the new flag into the **existing** `disabled` expression and
render `<ViewOnlyBanner />` adjacent to the existing `<WalletSyncingBanner />`.
Crucially, **also guard the submit/confirm handlers** so a programmatic path
(keyboard Enter on a form, a stale-cache race, a payment deep-link) cannot slip
a `createTx` through — defence in depth, since disabling a button is a UI-only
guarantee.

| Page | File | Existing disabled expr | Change |
|---|---|---|---|
| **Send** | `app/(wallet)/wallet/send/page.tsx:289` | `send.isPending \|\| sendToSelf \|\| isSyncing` | add `\|\| viewOnly`; also early-return in the `confirmSend` handler and in the form `onSubmit` (line 180) if `viewOnly`. Render `<ViewOnlyBanner />` above the form. Keep the Address/QR card (lines 300-317) fully functional. |
| **Deposits** | `deposits-page-client.tsx` | `createDisabled` (used at lines 134, 1205) and `DepositWithdrawButton` `disabled={!canWithdraw \|\| withdraw.isPending}` (line 1087) | fold `viewOnly` into `createDisabled`; add `\|\| viewOnly` to the withdraw button's disabled and short-circuit `confirmCreate`/`confirmWithdraw`. The page already reads deposits; show the list read-only. |
| **Messages** | `app/(wallet)/wallet/messages/page.tsx` | "New Message" `disabled={isSyncing}` (line 258), compose-send `disabled={send.isPending \|\| …}` (line 465), reply `disabled={!replyEnabled \|\| …}` (line 339) | add `\|\| viewOnly` to all three; short-circuit the compose submit handler (line ~205) and reply. **Reading messages stays enabled** (mark-read is a local/decrypt op, not a tx). |

Derive `viewOnly` once per page: `const viewOnly = isViewOnly(wallet.data)`
(Send/Messages already hold `const wallet = useWalletInfo()`). Deposits page
should add `const wallet = useWalletInfo()` (it currently uses `useDeposits` et
al.) — one line, same hook.

### 3.4 Why disable, not hide

Hiding Send/Deposits/Messages entirely would confuse users who imported a
watch-only wallet on purpose and expect to *see* the screens. A disabled control
plus a one-line "why" is the standard pattern this app already uses for syncing,
so it's the least surprising.

### 3.5 Copy (`lib/ui/wallet-copy.ts`)

Add to the `walletCopy` object (these don't differ by mock/real, so plain
strings):

```ts
viewOnlyBadge: "View-only",
viewOnlyBanner:
  "This is a view-only wallet — it has no spend key, so it can watch balances and receive but cannot send, deposit, or message. Import the full wallet (with its spend key) to unlock these actions.",
viewOnlyTooltip: "Unavailable in a view-only wallet.",
```

Optionally use `viewOnlyTooltip` as a `title`/tooltip on the disabled buttons.

---

## 4. Edge cases

1. **Refresh after reload (real mode).** Keys are *not* persisted across reload
   (CLAUDE.md: `persistWalletSession` is mock-only); the user must re-unlock.
   On unlock, `unlockStoredWallet` → `mapWalletToInfo` re-derives `viewOnly`
   from the rehydrated `Wallet`, so the flag is correct post-reload. ✅ No extra
   work. (The stored encrypted wallet for a view-only import has `priv.spend=""`,
   so `isViewOnly()` stays true.)

2. **Refresh after reload (mock mode).** `persistWalletSession` persists the
   `WalletInfo` to localStorage including `viewOnly`
   (`wallet-session.tsx:78`), so a reload restores the flag from
   `placeholderData` (`hooks/index.ts:34`). But `getWalletInfo` then refetches
   and mock returns `viewOnly:false`. See Risk R3 — for e2e we avoid reload.

3. **Switching wallets.** `closeSession()` clears `walletInfo`
   (`wallet-session.tsx:88-93`) and a fresh import/open re-derives the flag.
   Each `openSession` overwrites the query cache (`wallet-session.tsx:76`), so a
   full wallet opened after a view-only one correctly flips to `false`. ✅

4. **Deposits: withdraw vs view.** Withdraw needs a spend key (it builds a tx —
   `withdrawDepositOperation` calls `TransactionsExplorer`), so it's disabled.
   Viewing the deposit list, status, interest, and the calculator are all
   read-only and stay enabled. The "matured / ready to withdraw" labels still
   render; only the Withdraw button is neutralised.

5. **Messages: send vs read.** Sending posts a 0.0001 CCX envelope tx (needs
   spend key) → disabled. Reading and decrypting received messages, mark-as-read,
   and search are view-key operations → stay enabled. Reply is a send → disabled.

6. **Where `createTx` could still slip through.** The real failure today is deep
   in `TransactionsExplorer.createTx`. Our UI disables cover the buttons, but
   the handler short-circuits (§3.3) are the real guarantee:
   - Send payment **deep-link** (`parsePaymentSendDraft`, send/page.tsx:107-136)
     auto-fills and can `setReview(values)` → ensure `confirmSend` checks
     `viewOnly` and toasts `walletCopy.viewOnlyBanner` instead of calling the
     mutation.
   - Form **Enter key** submit (send/page.tsx:180 `onSubmit`) — guard there too.
   - Any future caller of `services.transactions.sendTransaction` /
     `messages.sendMessage` / `deposits.createDeposit|withdrawDeposit`. As a
     belt-and-braces backstop, consider a guard inside those real-mode service
     methods (throw a typed `ViewOnlyWalletError` with a friendly message) so
     even a non-UI caller fails cleanly — see Risk R2.

7. **Created wallet.** A freshly created wallet has a spend key →
   `isViewOnly()` false → all actions enabled. Covered by §2.1.

8. **Empty/loading wallet.** `wallet.data` is `undefined` during load;
   `isViewOnly(undefined)` returns `false`, so we never flash a spurious banner.
   We rely on the existing `wallet.data ?` guards already in the pages.

---

## 5. Test plan

### 5.1 Unit tests (vitest, `tests/`)

- **`tests/mock-services.test.ts`** (extend the existing file):
  - `importWallet({method:"keys", viewOnly:true, …})` resolves with
    `viewOnly === true`.
  - `importWallet({method:"keys", viewOnly:false, …})` and
    `importWallet({method:"mnemonic", …})` resolve with `viewOnly === false`.
  - `getWalletInfo()` / default `mockWalletInfo` → `viewOnly === false`.
  - Immutability: the returned object is not the same reference as
    `mockWalletInfo`, and `mockWalletInfo.viewOnly` is unchanged after a
    `viewOnly:true` import (guards against accidental mutation).

- **New `tests/view-only.test.ts`** for the pure helper:
  - `isViewOnly(undefined) === false`, `isViewOnly({…,viewOnly:false}) === false`,
    `isViewOnly({…,viewOnly:true}) === true`.

- **Type test (compile-time):** because `viewOnly` is required, `tsc --noEmit`
  (`npm run types`) fails if any `WalletInfo` literal omits it. This is the
  cheapest, strongest test — it forces `mockWalletInfo` and any fixture to
  comply. Note in the PR that `npm run types` is part of the gate.

- **Component test (RTL, optional but recommended):** render `ViewOnlyBanner`
  with a mocked `useWalletInfo` returning `viewOnly:true` → banner present;
  `false`/`undefined` → `null`. (Memory note: RTL needs manual cleanup in this
  repo.)

### 5.2 E2E (Playwright, `e2e/`)

The only existing spec is `e2e/golden-path.spec.ts` (forced mock). Add
**`e2e/view-only.spec.ts`**:

1. Navigate to onboarding → Import → **Keys** tab.
2. Toggle the **View-only** switch (onboarding-actions.tsx:462 `selected={viewOnly}`),
   fill a valid 64-hex `privateViewKey` and a 98-char `address`
   (`MOCK_ADDRESS` from `lib/mock-data/wallet.ts`), set a password, submit.
   In mock mode `keysValid` only needs view key + address when `viewOnly`
   (onboarding-actions.tsx:350-352), and `importWallet` returns
   `viewOnly:true` (§2.2).
3. Land on `/wallet/account`; assert the **"View-only" badge** is visible.
4. Go to **Send**: assert `[data-testid="view-only-banner"]` visible, the
   "Review Send" button is `disabled`, and the **Address/QR card is still
   present** (read-only proof).
5. Go to **Deposits**: assert the create "New deposit" button disabled and a
   withdraw button (if any deposit shown) disabled; banner visible.
6. Go to **Messages**: assert "New Message" disabled, banner visible, but the
   message **list/search still renders**.
7. (Optional negative) Re-run the golden path with a normal mock open and assert
   **no** view-only banner appears and Send is enabled — guards against the flag
   defaulting wrong.

> Do **not** reload the page mid-test (mock refetch would reset `viewOnly` —
> Risk R3). The flow above never reloads, matching real-mode UX where a reload
> requires re-unlock anyway.

---

## 6. Risks / open questions

- **R1 — Required vs optional field.** Making `viewOnly` required is a breaking
  change to the `WalletInfo` literal everywhere (forces edits to
  `mockWalletInfo` and any other fixture). I judge this a *feature*: the
  compiler enforces every producer set it, eliminating the silent-`false`
  footgun. If the team prefers minimal churn, fall back to
  `viewOnly?: boolean` + treat `undefined` as `false` via the `isViewOnly`
  helper — but then a forgotten producer silently enables Send. **Recommendation:
  required.**

- **R2 — Defence-in-depth in real services.** Should the real-mode
  `transactions.sendTransaction`, `messages.sendMessage`,
  `deposits.createDeposit`, and `deposits.withdrawDeposit` *also* throw a typed
  `ViewOnlyWalletError` before reaching the engine? This is the only thing that
  fully closes the "cryptic createTx failure" gap for *non-UI* callers. It
  requires touching the real service wrappers + (cleanly, without modernizing)
  reading `getRuntimeWallet()?.isViewOnly()` inside `wallet-operations`
  guards. **Recommendation: yes, add a single guard at the top of the four
  real operations**, returning a friendly message. The UI handler short-circuits
  (§3.3) still come first for instant feedback. Open question: confirm with the
  team that adding these guards in `wallet-operations.ts` is acceptable (it's an
  early-return, not a "modernization").

- **R3 — Mock refetch resets the flag.** In mock mode, `getWalletInfo`/
  `refreshWallet` ignore session and return `viewOnly:false`. After import the
  flag lives in the query cache + session, but a manual refetch (or reload)
  would flip it. Options: (a) accept it (e2e never reloads — chosen); (b) have
  the mock service remember the last imported `viewOnly` in a module-level
  variable so `getWalletInfo` echoes it. (b) is ~5 lines and makes mock behave
  more like real across refetch. **Recommendation: (b)** if the team wants mock
  manual-refresh to be faithful; otherwise (a).

- **R4 — Other surfaces that build txs.** Audit for any *other* action that
  needs a spend key beyond the three named pages — e.g. wallet optimization /
  fusion (`useOptimizeWallet`, `optimizationStatusQueryOptions`) also builds
  txs. The brief lists Send/Deposits/Messages only; flag that **Optimize**
  likely needs the same disable, and recommend gating its trigger on `viewOnly`
  too (out of brief scope but a real createTx path). Open question for triage.

- **R5 — Export semantics.** `exportWallet()` on a view-only wallet has no
  mnemonic/spend key. Not in scope for this feature, but worth confirming the
  Account/export UI doesn't promise a recovery phrase for a watch-only wallet.
  Flag for a follow-up; do not expand scope here.
